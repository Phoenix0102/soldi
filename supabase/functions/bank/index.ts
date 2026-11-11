// Collegamento bancario tramite Enable Banking (PSD2, sola lettura).
// La chiave privata dell'applicazione resta sul server (private.config), mai nel browser.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { createSign } from 'node:crypto'
import { Buffer } from 'node:buffer'

const API = 'https://api.enablebanking.com'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const romeDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d)
const normalize = (s: string) => s.toLowerCase().replace(/[0-9*#]+/g, ' ').replace(/[^a-zà-ú.& ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')

function signJwt(appId: string, pem: string) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }))
  const body = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }))
  const s = createSign('RSA-SHA256')
  s.update(`${head}.${body}`)
  return `${head}.${body}.${b64url(s.sign(pem))}`
}

async function eb(cfg: { appId: string; pem: string }, path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${signJwt(cfg.appId, cfg.pem)}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const text = await r.text()
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!r.ok) throw new Error(`Enable Banking ${r.status}: ${(data.message as string) ?? (data.detail as string) ?? text.slice(0, 200)}`)
  return data
}

async function sha(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Scarica movimenti e saldo dei conti collegati di un utente. */
async function syncUser(admin: SupabaseClient, cfg: { appId: string; pem: string }, userId: string) {
  const { data: conns } = await admin.from('bank_connections').select('*').eq('user_id', userId).eq('status', 'active')
  const { data: links } = await admin.from('bank_accounts').select('*').eq('user_id', userId).not('account_id', 'is', null)
  const [{ data: rules }, { data: cats }] = await Promise.all([
    admin.from('rules').select('pattern, category_id, rename_to, priority').eq('user_id', userId),
    admin.from('categories').select('id, kind').eq('user_id', userId),
  ])
  const kindOf = new Map((cats ?? []).map((c) => [c.id, c.kind]))
  const sortedRules = (rules ?? []).sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length)
  let inserted = 0, merged = 0
  const errors: string[] = []

  for (const conn of conns ?? []) {
    if (conn.valid_until && new Date(conn.valid_until) < new Date()) {
      await admin.from('bank_connections').update({ status: 'expired' }).eq('id', conn.id)
      continue
    }
    for (const link of (links ?? []).filter((l) => l.connection_id === conn.id)) {
      try {
        const from = link.last_sync_at ? romeDate(new Date(new Date(link.last_sync_at).getTime() - 7 * 86400000)) : romeDate(new Date(Date.now() - 90 * 86400000))
        const txs: Record<string, unknown>[] = []
        let ck: string | undefined
        for (let page = 0; page < 20; page++) {
          const q = new URLSearchParams({ date_from: from })
          if (ck) q.set('continuation_key', ck)
          const r = await eb(cfg, `/accounts/${link.uid}/transactions?${q}`)
          txs.push(...((r.transactions as Record<string, unknown>[]) ?? []))
          ck = r.continuation_key as string | undefined
          if (!ck) break
        }
        const { data: existing } = await admin.from('transactions').select('id, amount, date, source, import_hash').eq('account_id', link.account_id).gte('date', from)
        const free = (existing ?? []).filter((e) => e.source !== 'bank' && e.source !== 'csv' && !e.import_hash)
        const known = new Set((existing ?? []).map((e) => e.import_hash).filter(Boolean))

        for (const t of txs) {
          if (t.status && t.status !== 'BOOK') continue
          const amt = Number((t.transaction_amount as { amount?: string })?.amount ?? 0)
          if (!amt) continue
          const signed = t.credit_debit_indicator === 'DBIT' ? -Math.abs(amt) : Math.abs(amt)
          const date = String(t.booking_date ?? t.transaction_date ?? t.value_date ?? romeDate()).slice(0, 10)
          const counterpart = ((signed < 0 ? t.creditor : t.debtor) as { name?: string } | undefined)?.name ?? ''
          const remit = Array.isArray(t.remittance_information) ? (t.remittance_information as string[]).join(' ') : String(t.remittance_information ?? '')
          const description = (counterpart || remit || String(t.note ?? '') || 'Movimento bancario').replace(/\s+/g, ' ').trim().slice(0, 120)
          const ref = String(t.entry_reference ?? t.transaction_id ?? '')
          const hash = 'eb:' + (ref ? await sha(`${link.uid}|${ref}`) : await sha(`${link.uid}|${date}|${signed}|${description}`))
          if (known.has(hash)) continue
          known.add(hash)

          // Già registrato a mano o da Apple Pay? Lo collego invece di duplicarlo
          const twin = free.find((e) => Math.abs(Number(e.amount) - signed) < 0.01 && Math.abs(new Date(e.date).getTime() - new Date(date).getTime()) <= 3 * 86400000)
          if (twin) {
            free.splice(free.indexOf(twin), 1)
            await admin.from('transactions').update({ import_hash: hash, external_id: ref || null }).eq('id', twin.id)
            merged++
            continue
          }
          const want = signed > 0 ? 'income' : 'expense'
          const up = ` ${`${description} ${remit}`.toUpperCase()} `
          const rule = sortedRules.find((r) => r.pattern && up.includes(r.pattern.toUpperCase()) && kindOf.get(r.category_id) === want)
          let categoryId = rule?.category_id ?? null
          if (!categoryId) {
            const { data: hist } = await admin.from('transactions').select('description, category_id').eq('user_id', userId).not('category_id', 'is', null).order('date', { ascending: false }).limit(300)
            categoryId = hist?.find((h) => normalize(h.description) === normalize(description))?.category_id ?? null
          }
          const transferHint = /(giroconto|trasferimento tra|ricarica|top.?up|bonifico a (me|mio))/i.test(up)
          const { error } = await admin.from('transactions').insert({
            user_id: userId, account_id: link.account_id, date, amount: signed, kind: transferHint ? 'transfer' : want,
            description: rule?.rename_to || description, category_id: transferHint ? null : categoryId,
            source: 'bank', import_hash: hash, external_id: ref || null, notes: remit && remit !== description ? remit.slice(0, 200) : null,
          })
          if (!error) inserted++
        }

        // Saldo dalla banca come saldo verificato di oggi
        const bal = await eb(cfg, `/accounts/${link.uid}/balances`)
        const list = (bal.balances as { balance_type: string; balance_amount: { amount: string } }[]) ?? []
        const pick = ['CLBD', 'ITBD', 'XPCD', 'ITAV', 'CLAV', 'OPBD'].map((k) => list.find((b) => b.balance_type === k)).find(Boolean) ?? list[0]
        if (pick) {
          const today = romeDate()
          await admin.from('balance_snapshots').delete().eq('account_id', link.account_id).eq('date', today)
          await admin.from('balance_snapshots').insert({ user_id: userId, account_id: link.account_id, date: today, balance: Number(pick.balance_amount.amount) })
        }
        await admin.from('bank_accounts').update({ last_sync_at: new Date().toISOString() }).eq('id', link.id)
      } catch (e) {
        errors.push(`${link.name ?? link.iban}: ${(e as Error).message}`)
      }
    }
    await admin.from('bank_connections').update({ last_sync_at: new Date().toISOString(), last_error: errors.length ? errors.join(' | ').slice(0, 500) : null }).eq('id', conn.id)
  }
  return { inserted, merged, errors }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const cfgVal = async (k: string) => (await admin.rpc('get_config', { k })).data as string | null
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const loadCfg = async () => {
    const appId = await cfgVal('eb_app_id'), pem = await cfgVal('eb_private_key')
    return appId && pem ? { appId, pem } : null
  }

  // Sincronizzazione notturna
  const cron = req.headers.get('x-cron-secret')
  if (cron) {
    if (cron !== (await cfgVal('cron_secret'))) return json({ error: 'Non autorizzato' }, 401)
    const cfg = await loadCfg()
    if (!cfg) return json({ skipped: 'non configurato' })
    const { data: owners } = await admin.from('bank_connections').select('user_id').eq('status', 'active')
    const out = []
    for (const u of new Set((owners ?? []).map((o) => o.user_id))) out.push(await syncUser(admin, cfg, u))
    return json({ ok: true, out })
  }

  // Tutte le altre azioni: solo il proprietario dell'app
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u.user) return json({ error: 'Non autorizzato' }, 401)
  const { data: owner } = await admin.from('app_owner').select('user_id').eq('user_id', u.user.id).maybeSingle()
  if (!owner) return json({ error: 'Non autorizzato' }, 403)
  const userId = u.user.id

  try {
    if (action === 'status') {
      const cfg = await loadCfg()
      return json({ configured: !!cfg, appId: cfg?.appId ?? null })
    }
    if (action === 'configure') {
      const appId = String(body.app_id ?? '').trim()
      const pem = String(body.private_key ?? '').trim()
      if (!/^[0-9a-f-]{36}$/i.test(appId)) return json({ error: 'L\'ID applicazione non sembra valido' }, 400)
      if (!pem.includes('PRIVATE KEY')) return json({ error: 'La chiave privata deve essere il contenuto del file .pem' }, 400)
      const app = await eb({ appId, pem }, '/application')
      await admin.rpc('set_config_value', { k: 'eb_app_id', v: appId })
      await admin.rpc('set_config_value', { k: 'eb_private_key', v: pem })
      return json({ ok: true, name: app.name ?? null, environment: app.environment ?? null, active: app.active ?? null, redirect_urls: app.redirect_urls ?? [] })
    }
    if (action === 'forget') {
      await admin.rpc('delete_config_value', { k: 'eb_app_id' })
      await admin.rpc('delete_config_value', { k: 'eb_private_key' })
      return json({ ok: true })
    }

    const cfg = await loadCfg()
    if (!cfg) return json({ error: 'Collegamento bancario non configurato' }, 400)

    if (action === 'aspsps') {
      const r = await eb(cfg, `/aspsps?country=${encodeURIComponent(String(body.country ?? 'IT'))}&psu_type=personal&service=AIS`)
      return json({ aspsps: ((r.aspsps as Record<string, unknown>[]) ?? []).map((a) => ({ name: a.name, country: a.country, logo: a.logo, max: a.maximum_consent_validity })) })
    }
    if (action === 'start') {
      const name = String(body.aspsp_name), country = String(body.country ?? 'IT')
      const maxSec = Number(body.max ?? 0) || 180 * 86400
      const validUntil = new Date(Date.now() + Math.min(maxSec, 180 * 86400) * 1000 - 3600_000).toISOString()
      const state = crypto.randomUUID()
      const r = await eb(cfg, '/auth', { method: 'POST', body: JSON.stringify({ access: { valid_until: validUntil }, aspsp: { name, country }, state, redirect_url: String(body.redirect_url), psu_type: 'personal' }) })
      await admin.from('bank_connections').insert({ user_id: userId, aspsp_name: name, country, state, valid_until: validUntil, status: 'pending' })
      return json({ url: r.url })
    }
    if (action === 'complete') {
      const { data: conn } = await admin.from('bank_connections').select('*').eq('state', String(body.state)).eq('user_id', userId).maybeSingle()
      if (!conn) return json({ error: 'Richiesta di collegamento non trovata o già usata' }, 400)
      const s = await eb(cfg, '/sessions', { method: 'POST', body: JSON.stringify({ code: String(body.code) }) })
      const access = s.access as { valid_until?: string } | undefined
      await admin.from('bank_connections').update({ session_id: s.session_id, status: 'active', state: null, valid_until: access?.valid_until ?? conn.valid_until }).eq('id', conn.id)
      const { data: ours } = await admin.from('accounts').select('id, name, institution').eq('user_id', userId).eq('archived', false)
      const bank = conn.aspsp_name.toLowerCase()
      const guess = ours?.find((a) => a.institution && (bank.includes(a.institution.toLowerCase()) || a.institution.toLowerCase().includes(bank.split(' ')[0])))
      const accts = (s.accounts as Record<string, unknown>[]) ?? []
      for (const a of accts) {
        const iban = (a.account_id as { iban?: string } | undefined)?.iban ?? null
        await admin.from('bank_accounts').upsert({ user_id: userId, connection_id: conn.id, uid: a.uid, iban, name: (a.name as string) ?? (a.product as string) ?? conn.aspsp_name, currency: a.currency, account_id: accts.length === 1 ? guess?.id ?? null : null }, { onConflict: 'connection_id,uid' })
      }
      return json({ ok: true, accounts: accts.length, bank: conn.aspsp_name })
    }
    if (action === 'sync') return json(await syncUser(admin, cfg, userId))
    if (action === 'disconnect') {
      const { data: conn } = await admin.from('bank_connections').select('*').eq('id', String(body.id)).eq('user_id', userId).maybeSingle()
      if (conn?.session_id) await eb(cfg, `/sessions/${conn.session_id}`, { method: 'DELETE' }).catch(() => null)
      await admin.from('bank_connections').delete().eq('id', String(body.id)).eq('user_id', userId)
      return json({ ok: true })
    }
    return json({ error: 'Azione non valida' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
