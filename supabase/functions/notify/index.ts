// Notifiche push: scadenze dei ricorrenti, budget quasi finiti, resoconto del mese.
// Chiamata ogni mattina da pg_cron (header x-cron-secret) o dall'app per una notifica di prova (token utente).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const eur = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const romeDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d)
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

type Msg = { key?: string; title: string; body: string; url: string }

// --- APNs (app iOS nativa) ---------------------------------------------------
const TOPIC = 'com.phoenix0102.soldi'
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))

/** Token JWT firmato con la chiave .p8 di Apple (ES256). */
async function apnsJwt(keyId: string, teamId: string, p8: string) {
  const der = Uint8Array.from(atob(p8.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = `${enc({ alg: 'ES256', kid: keyId })}.${enc({ iss: teamId, iat: Math.floor(Date.now() / 1000) })}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head))
  return `${head}.${b64url(sig)}`
}

/** Invia una notifica APNs. Restituisce 'ok', 'gone' (token da eliminare) o il motivo dell'errore. */
async function apnsSend(jwt: string, token: string, m: Msg, sandbox = false): Promise<string> {
  const host = sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`, 'apns-topic': TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400), 'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'default' }, url: m.url }),
  })
  if (res.ok) return 'ok'
  const reason = (await res.json().catch(() => ({}))).reason ?? `HTTP ${res.status}`
  // Le build di sviluppo usano l'ambiente sandbox
  if (!sandbox && reason === 'BadDeviceToken') return apnsSend(jwt, token, m, true)
  if (res.status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken') return 'gone'
  return reason
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const cfg = async (k: string) => (await admin.rpc('get_config', { k })).data as string | null

  const body = await req.json().catch(() => ({}))
  const cronOk = req.headers.get('x-cron-secret') && req.headers.get('x-cron-secret') === (await cfg('cron_secret'))
  let onlyUser: string | null = null
  if (!cronOk) {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data } = await admin.auth.getUser(jwt)
    if (!data.user) return json({ error: 'Non autorizzato' }, 401)
    onlyUser = data.user.id
  }

  // Configurazione APNs per l'app iOS: solo il proprietario, la chiave resta in private.config
  if (onlyUser && typeof body.action === 'string' && body.action.startsWith('apns_')) {
    const { data: owner } = await admin.from('app_owner').select('user_id').eq('user_id', onlyUser).maybeSingle()
    if (!owner) return json({ error: 'Non autorizzato' }, 403)
    if (body.action === 'apns_status') return json({ configured: !!(await cfg('apns_key')), keyId: await cfg('apns_key_id') })
    if (body.action === 'apns_configure') {
      const keyId = String(body.key_id ?? '').trim().toUpperCase(), teamId = String(body.team_id ?? '').trim().toUpperCase(), p8 = String(body.p8 ?? '').trim()
      if (!/^[A-Z0-9]{10}$/.test(keyId)) return json({ error: 'Il Key ID è di 10 caratteri (lettere e numeri)' }, 400)
      if (!/^[A-Z0-9]{10}$/.test(teamId)) return json({ error: 'Il Team ID è di 10 caratteri (lettere e numeri)' }, 400)
      if (!p8.includes('PRIVATE KEY')) return json({ error: 'Serve il contenuto del file .p8' }, 400)
      try { await apnsJwt(keyId, teamId, p8) } catch { return json({ error: 'La chiave .p8 non è leggibile' }, 400) }
      await admin.rpc('set_config_value', { k: 'apns_key_id', v: keyId })
      await admin.rpc('set_config_value', { k: 'apns_team_id', v: teamId })
      await admin.rpc('set_config_value', { k: 'apns_key', v: p8 })
      return json({ ok: true })
    }
    if (body.action === 'apns_forget') {
      for (const k of ['apns_key_id', 'apns_team_id', 'apns_key']) await admin.rpc('delete_config_value', { k })
      return json({ ok: true })
    }
    return json({ error: 'Azione sconosciuta' }, 400)
  }

  // Il token APNs vale fino a un'ora: uno per esecuzione basta
  const apnsKey = await cfg('apns_key')
  const apnsToken = apnsKey ? await apnsJwt((await cfg('apns_key_id'))!, (await cfg('apns_team_id'))!, apnsKey).catch(() => null) : null
  let lastError: string | null = null

  webpush.setVapidDetails('mailto:owner@soldi.local', (await cfg('vapid_public'))!, (await cfg('vapid_private'))!)

  let subsQ = admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
  if (onlyUser) subsQ = subsQ.eq('user_id', onlyUser)
  const { data: subs } = await subsQ
  const byUser = new Map<string, typeof subs>()
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  const send = async (userId: string, m: Msg) => {
    if (m.key) {
      const { error } = await admin.from('notification_log').insert({ user_id: userId, key: m.key })
      if (error) return 0 // già inviata
    }
    let ok = 0
    for (const s of byUser.get(userId) ?? []) {
      if (s.endpoint.startsWith('apns:')) {
        if (!apnsToken) { lastError = 'Notifiche dell\'app iOS non configurate (manca la chiave APNs)'; continue }
        const r = await apnsSend(apnsToken, s.endpoint.slice(5), m).catch((e) => String(e))
        if (r === 'ok') ok++
        else if (r === 'gone') await admin.from('push_subscriptions').delete().eq('id', s.id)
        else lastError = `APNs: ${r}`
        continue
      }
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: m.title, body: m.body, url: m.url }), { TTL: 86400 })
        ok++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
    return ok
  }

  if (onlyUser && body.test) {
    const n = await send(onlyUser, { title: 'Soldi', body: 'Le notifiche funzionano. Ti avviserò per scadenze, budget e resoconto del mese.', url: '/' })
    return json({ sent: n, devices: byUser.get(onlyUser)?.length ?? 0, error: lastError })
  }

  const today = romeDate()
  const tomorrow = romeDate(new Date(Date.now() + 86400000))
  const month = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  let total = 0

  for (const userId of byUser.keys()) {
    const { data: st } = await admin.from('app_settings').select('data').eq('user_id', userId).maybeSingle()
    const prefs = { scadenze: true, budget: true, resoconto: true, ...((st?.data as Record<string, unknown>)?.notify as Record<string, boolean> ?? {}) }

    if (prefs.scadenze) {
      const { data: rec } = await admin.from('recurring').select('id, name, amount, kind, next_date').eq('user_id', userId).eq('active', true).in('next_date', [today, tomorrow])
      for (const r of rec ?? []) {
        const when = r.next_date === today ? 'oggi' : 'domani'
        total += await send(userId, { key: `rec:${r.id}:${r.next_date}:${when}`, title: `${r.name} ${when}`, body: `${r.kind === 'income' ? 'Entrata prevista' : 'Addebito previsto'} di ${eur(Number(r.amount))}.`, url: '/piano?tab=recurring' })
      }
    }

    if (prefs.budget) {
      const [{ data: budgets }, { data: cats }, { data: txs }] = await Promise.all([
        admin.from('budgets').select('category_id, amount').eq('user_id', userId),
        admin.from('categories').select('id, name').eq('user_id', userId),
        admin.from('transactions').select('category_id, amount').eq('user_id', userId).eq('kind', 'expense').gte('date', `${month}-01`).lte('date', today),
      ])
      const spent = new Map<string, number>()
      for (const t of txs ?? []) if (t.category_id) spent.set(t.category_id, (spent.get(t.category_id) ?? 0) - Number(t.amount))
      for (const b of budgets ?? []) {
        const s = spent.get(b.category_id) ?? 0, limit = Number(b.amount)
        const name = cats?.find((c) => c.id === b.category_id)?.name ?? 'Categoria'
        if (limit > 0 && s >= limit) total += await send(userId, { key: `b100:${b.category_id}:${month}`, title: `Budget superato: ${name}`, body: `Hai speso ${eur(s)} su ${eur(limit)} questo mese.`, url: '/piano' })
        else if (limit > 0 && s >= limit * 0.8) total += await send(userId, { key: `b80:${b.category_id}:${month}`, title: `${name}: budget all'${Math.round((s / limit) * 100)}%`, body: `Restano ${eur(limit - s)} fino a fine mese.`, url: '/piano' })
      }
    }

    if (prefs.resoconto && day === 1) {
      const prev = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)
      total += await send(userId, { key: `report:${month}`, title: `Il resoconto di ${MONTHS[prev.getMonth()]} è pronto`, body: 'Quanto hai risparmiato, dove sono andati i soldi e cosa tenere d\'occhio.', url: '/resoconto' })
    }
  }
  return json({ sent: total, users: byUser.size })
})
