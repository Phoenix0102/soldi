// Riceve un pagamento da Comandi Rapidi (Apple Pay) e lo registra come uscita.
// Autenticazione: token personale generato nelle Impostazioni dell'app (ne salviamo solo l'hash).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-soldi-token, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw).trim().replace(/[€$£\s ]/g, '').replace(/EUR|USD|GBP/gi, '')
  if (!s) return null
  let neg = false
  if (s.startsWith('-') || s.startsWith('−')) { neg = true; s = s.slice(1) }
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.')
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (lc > -1) s = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -Math.abs(n) : n
}

const normalize = (s: string) => s.toLowerCase().replace(/[0-9*#]+/g, ' ').replace(/[^a-zà-ú.& ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')

function todayRome() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function parseDate(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'Usa POST' }, 405)

  const token = (req.headers.get('x-soldi-token') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '').trim()
  if (token.length < 20) return json({ ok: false, error: 'Token mancante' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: tok } = await admin.from('api_tokens').select('id, user_id').eq('token_hash', await sha256(token)).maybeSingle()
  if (!tok) return json({ ok: false, error: 'Token non valido' }, 401)
  const userId = tok.user_id as string

  let body: Record<string, unknown> = {}
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) body = await req.json()
    else if (ct.includes('form')) body = Object.fromEntries((await req.formData()).entries())
    else { const t = await req.text(); try { body = JSON.parse(t) } catch { body = {} } }
  } catch { body = {} }

  // Verifica del collegamento dall'app: non registra nulla
  if (body.test === true || body.test === 'true') {
    await admin.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id)
    return json({ ok: true, message: 'Collegamento riuscito' })
  }

  const amount = parseAmount(body.amount ?? body.importo)
  if (amount === null || amount === 0) return json({ ok: false, error: 'Importo mancante o non leggibile', received: body.amount ?? null }, 400)
  const merchant = String(body.merchant ?? body.esercente ?? '').trim().slice(0, 120)
  const card = String(body.card ?? body.carta ?? '').trim().slice(0, 80)
  const type = String(body.type ?? body.tipo ?? '').toLowerCase()
  const isIncome = type === 'income' || type === 'entrata'
  const signed = isIncome ? Math.abs(amount) : -Math.abs(amount)
  const date = parseDate(body.date) ?? todayRome()

  const [{ data: accounts }, { data: settings }, { data: rules }, { data: cats }] = await Promise.all([
    admin.from('accounts').select('id, name, institution, wallet_match, archived, sort').eq('user_id', userId).eq('archived', false).order('sort'),
    admin.from('app_settings').select('default_account_id').eq('user_id', userId).maybeSingle(),
    admin.from('rules').select('pattern, category_id, rename_to, priority').eq('user_id', userId),
    admin.from('categories').select('id, kind').eq('user_id', userId),
  ])
  if (!accounts?.length) return json({ ok: false, error: 'Nessun conto attivo' }, 400)

  // Conto: prima le corrispondenze impostate sui conti, poi nome/banca contenuti nel nome della carta
  const cardL = card.toLowerCase()
  const byMatch = accounts.find((a) => (a.wallet_match ?? '').split(',').map((p: string) => p.trim().toLowerCase()).filter(Boolean).some((p: string) => cardL.includes(p)))
  const byName = cardL ? accounts.find((a) => [a.institution, a.name.split(' ')[0]].filter(Boolean).some((n) => cardL.includes(String(n).toLowerCase()))) : undefined
  const account = byMatch ?? byName ?? accounts.find((a) => a.id === settings?.default_account_id) ?? accounts[0]

  // Categoria: regole, poi storico dello stesso esercente
  const kindOf = new Map((cats ?? []).map((c) => [c.id, c.kind]))
  const want = signed > 0 ? 'income' : 'expense'
  const up = ` ${merchant.toUpperCase()} `
  const rule = (rules ?? [])
    .sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length)
    .find((r) => r.pattern && up.includes(r.pattern.toUpperCase()) && kindOf.get(r.category_id) === want)
  let categoryId: string | null = rule?.category_id ?? null
  if (!categoryId && merchant) {
    const key = normalize(merchant)
    const { data: hist } = await admin.from('transactions').select('description, category_id').eq('user_id', userId).not('category_id', 'is', null).order('date', { ascending: false }).limit(400)
    categoryId = hist?.find((t) => normalize(t.description) === key)?.category_id ?? null
  }

  const description = rule?.rename_to || merchant || 'Apple Pay'
  const { error } = await admin.from('transactions').insert({
    user_id: userId, account_id: account.id, date, amount: signed, kind: want, description,
    category_id: categoryId, source: 'shortcut', notes: card ? `Carta: ${card}` : null,
  })
  if (error) return json({ ok: false, error: error.message }, 500)
  await admin.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id)

  const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Math.abs(signed))
  return json({ ok: true, message: `Registrata: ${description} ${euro} su ${account.name}${categoryId ? '' : ' (da categorizzare)'}` })
})
