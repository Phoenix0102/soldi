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
    return json({ sent: n, devices: byUser.get(onlyUser)?.length ?? 0 })
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
