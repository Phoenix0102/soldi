/* Abbonamenti e spese ricorrenti riconosciuti dai movimenti: costo annuo, aumenti di prezzo, doppioni. */
import { differenceInCalendarDays, parseISO, subMonths, format } from 'date-fns'
import { merchantKey, titleCase } from './finance'
import { round2 } from './format'
import type { Transaction } from './types'

export interface Subscription {
  key: string
  name: string
  amount: number          // ultimo addebito
  previous: number | null // importo abituale prima dell'ultimo (se diverso)
  cadence: 'monthly' | 'yearly' | 'weekly'
  monthly: number         // costo equivalente al mese
  yearly: number
  last: string            // data ultimo addebito
  next: string            // prossimo previsto
  count: number
  active: boolean
  hike: number | null     // aumento percentuale, se c'è
  accounts: string[]
  categoryId: string | null
  /** subscription: servizi (streaming, telefono, app…) · fixed: altre spese fisse (affitto, rate) */
  type: 'subscription' | 'fixed'
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0 }

const SERVICES = /netflix|spotify|apple|icloud|google|youtube|amazon|prime|disney|dazn|now tv|\bsky\b|\btim\b|vodafone|wind|iliad|fastweb|ho\.? mobile|very mobile|kena|chatgpt|openai|anthropic|claude|adobe|microsoft|xbox|playstation|nintendo|audible|kindle|dropbox|notion|canva|github|patreon|twitch|\bgym\b|palestra|mcfit|virgin/i
const nice = (k: string) => titleCase(k.toLowerCase().replace(/\.(com|it|eu|net|io)\b/g, '').replace(/\/bill$/, '').trim())

export function detectSubscriptions(txs: Transaction[], categories: { id: string; name: string }[] = []): Subscription[] {
  const since = format(subMonths(new Date(), 14), 'yyyy-MM-dd')
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.kind !== 'expense' || t.date < since) continue
    const k = merchantKey(t.description)
    if (k.length < 3) continue
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const out: Subscription[] = []
  const today = new Date()
  for (const [key, list] of groups) {
    const g = [...list].sort((a, b) => a.date.localeCompare(b.date))
    if (g.length < 3) continue
    const amounts = g.map((t) => -t.amount)
    const med = median(amounts)
    // Importi stabili (tolleranza 12% o 1 €): è un addebito ricorrente, non spesa variabile
    const stable = amounts.filter((a) => Math.abs(a - med) <= Math.max(1, med * 0.12)).length / amounts.length
    if (stable < 0.7) continue
    const gaps = g.slice(1).map((t, i) => differenceInCalendarDays(parseISO(t.date), parseISO(g[i].date)))
    const gap = median(gaps)
    const cadence = gap >= 25 && gap <= 36 ? 'monthly' : gap >= 5 && gap <= 9 ? 'weekly' : gap >= 330 && gap <= 400 ? 'yearly' : null
    if (!cadence) continue
    // Più addebiti nello stesso mese: probabilmente spesa ripetuta, non abbonamento (tranne settimanali)
    const months = new Set(g.map((t) => t.date.slice(0, 7)))
    if (cadence === 'monthly' && months.size < g.length * 0.75) continue
    const lastTx = g[g.length - 1]
    const amount = -lastTx.amount
    const before = amounts.slice(0, -1)
    const prev = before.length ? median(before.slice(-4)) : null
    const hike = prev && amount > prev * 1.03 && amount - prev >= 0.5 ? (amount - prev) / prev : null
    const days = cadence === 'monthly' ? 30.4 : cadence === 'weekly' ? 7 : 365
    const nextDate = new Date(parseISO(lastTx.date).getTime() + days * 86400000)
    const monthly = cadence === 'monthly' ? amount : cadence === 'weekly' ? amount * 52 / 12 : amount / 12
    const catName = categories.find((c) => c.id === lastTx.category_id)?.name ?? ''
    const type = SERVICES.test(key) || /abbonam|streaming|telefon|app/i.test(catName) || (amount <= 30 && cadence !== 'weekly') ? 'subscription' : 'fixed'
    out.push({
      key, name: nice(key), amount, type, previous: hike ? prev : null, cadence,
      monthly: round2(monthly), yearly: round2(monthly * 12), last: lastTx.date, next: format(nextDate, 'yyyy-MM-dd'),
      count: g.length, active: differenceInCalendarDays(today, parseISO(lastTx.date)) <= days * 1.6,
      hike, accounts: [...new Set(g.map((t) => t.account_id))], categoryId: lastTx.category_id,
    })
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.monthly - a.monthly)
}

/** Possibili doppioni: stesso servizio addebitato su due conti, o due abbonamenti con nome quasi uguale. */
export function duplicates(subs: Subscription[]) {
  const act = subs.filter((s) => s.active)
  const out: [Subscription, Subscription][] = []
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    const a = act[i], b = act[j]
    const wa = a.key.split(' ')[0], wb = b.key.split(' ')[0]
    if (wa.length >= 4 && wa === wb) out.push([a, b])
  }
  return out
}
