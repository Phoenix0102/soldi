// Quotazioni per il portafoglio: ricerca titoli (ISIN, ticker, nome) e aggiornamento dei prezzi.
// Usa l'endpoint pubblico di Yahoo Finance; le chiamate partono dal server perché il browser le bloccherebbe (CORS).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', Accept: 'application/json' }

interface Quote { symbol: string; price: number; prevClose: number | null; currency: string; name: string | null }

async function quote(symbol: string): Promise<Quote | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, { headers: UA })
      if (!r.ok) continue
      const j = await r.json()
      const m = j?.chart?.result?.[0]?.meta
      if (!m?.regularMarketPrice) continue
      return { symbol, price: m.regularMarketPrice, prevClose: m.chartPreviousClose ?? m.previousClose ?? null, currency: m.currency ?? 'EUR', name: m.longName ?? m.shortName ?? null }
    } catch { /* provo l'altro host */ }
  }
  return null
}

const fxCache = new Map<string, number>()
async function toEur(currency: string) {
  const c = (currency || 'EUR').toUpperCase()
  if (c === 'EUR') return 1
  if (c === 'GBX' || c === 'GBP') {
    const gbp = fxCache.get('GBP') ?? (await quote('GBPEUR=X'))?.price ?? 1.17
    fxCache.set('GBP', gbp)
    return c === 'GBX' ? gbp / 100 : gbp
  }
  const v = fxCache.get(c) ?? (await quote(`${c}EUR=X`))?.price
  if (v) fxCache.set(c, v)
  return v ?? 1
}

async function search(q: string) {
  const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&lang=it-IT&region=IT`, { headers: UA })
  if (!r.ok) return []
  const j = await r.json()
  const prefer = ['.DE', '.MI', '.AS', '.PA', '.L', '.SW']
  return (j?.quotes ?? [])
    .filter((x: Record<string, unknown>) => x.symbol && ['ETF', 'EQUITY', 'MUTUALFUND', 'CRYPTOCURRENCY', 'INDEX'].includes(String(x.quoteType)))
    .map((x: Record<string, unknown>) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? x.symbol, exchange: x.exchDisp ?? x.exchange, type: x.quoteType }))
    .sort((a: { symbol: string }, b: { symbol: string }) => {
      const ia = prefer.findIndex((s) => a.symbol.endsWith(s)), ib = prefer.findIndex((s) => b.symbol.endsWith(s))
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body = await req.json().catch(() => ({}))

  if (body.search) return json({ results: await search(String(body.search).slice(0, 60)) })

  if (body.symbol) {
    const q = await quote(String(body.symbol))
    if (!q) return json({ error: 'Quotazione non trovata' }, 404)
    const fx = await toEur(q.currency)
    return json({ ...q, priceEur: q.price * fx, prevCloseEur: q.prevClose ? q.prevClose * fx : null })
  }

  if (body.refresh) {
    // Client con il token dell'utente: valgono le stesse regole di accesso dell'app
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
    })
    const { data: holdings, error } = await db.from('holdings').select('id, account_id, symbol, quantity, last_price, avg_price')
    if (error) return json({ error: error.message }, 401)
    const now = new Date().toISOString()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
    const totals = new Map<string, number>()
    const failed: string[] = []
    const unique = [...new Set((holdings ?? []).map((h) => h.symbol))]
    const prices = new Map<string, { p: number; pc: number | null }>()
    await Promise.all(unique.map(async (s) => {
      const q = await quote(s)
      if (!q) { failed.push(s); return }
      const fx = await toEur(q.currency)
      prices.set(s, { p: q.price * fx, pc: q.prevClose ? q.prevClose * fx : null })
    }))
    for (const h of holdings ?? []) {
      const pr = prices.get(h.symbol)
      if (pr) await db.from('holdings').update({ last_price: pr.p, prev_close: pr.pc, last_price_at: now, currency: 'EUR' }).eq('id', h.id)
      // Se una quotazione non arriva uso l'ultimo prezzo noto, così il totale non crolla
      const price = pr?.p ?? Number(h.last_price ?? h.avg_price ?? 0)
      totals.set(h.account_id, (totals.get(h.account_id) ?? 0) + Number(h.quantity) * price)
    }
    // Il valore del portafoglio diventa il saldo verificato di oggi del conto investimenti
    for (const [accountId, value] of totals) {
      await db.from('balance_snapshots').delete().eq('account_id', accountId).eq('date', today)
      await db.from('balance_snapshots').insert({ account_id: accountId, date: today, balance: Math.round(value * 100) / 100 })
    }
    return json({ updated: prices.size, failed, at: now })
  }

  return json({ error: 'Richiesta non valida' }, 400)
})
