import { endOfMonth, format, getDaysInMonth, startOfMonth, subMonths } from 'date-fns'
import type { Account, Budget, Category, Recurring, Snapshot, Transaction } from './types'
import { balanceAt, cashflow, inMonth, normalizeDesc, spendByCategory, titleCase } from './finance'
import { money, percent } from './format'

export interface CategoryChange { id: string | null; spent: number; avg: number; diff: number; pct: number }
export interface Insight { tone: 'good' | 'warn' | 'info'; text: string }

const avgOf = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0)

/** Tutto ciò che serve per il resoconto di un mese. */
export function monthReport(month: Date, txs: Transaction[], accounts: Account[], snaps: Snapshot[], budgets: Budget[], recurring: Recurring[]) {
  const cur = inMonth(txs, month)
  const prevMonths = [1, 2, 3].map((i) => inMonth(txs, subMonths(month, i))).filter((m) => m.length)
  const flow = cashflow(cur)
  const prev = cashflow(inMonth(txs, subMonths(month, 1)))
  const avgIncome = avgOf(prevMonths.map((m) => cashflow(m).income))
  const avgExpense = avgOf(prevMonths.map((m) => cashflow(m).expense))
  const rate = flow.income > 0 ? flow.net / flow.income : 0

  // Categorie: questo mese contro la media dei 3 precedenti
  const spent = spendByCategory(cur)
  const prevSpent = prevMonths.map(spendByCategory)
  const ids = new Set<string | null>([...spent.keys(), ...prevSpent.flatMap((m) => [...m.keys()])])
  const changes: CategoryChange[] = [...ids].map((id) => {
    const s = spent.get(id) ?? 0
    const a = prevMonths.length ? avgOf(prevSpent.map((m) => m.get(id) ?? 0)) : 0
    return { id, spent: s, avg: a, diff: s - a, pct: a > 0 ? (s - a) / a : s > 0 ? 1 : 0 }
  }).filter((c) => c.spent > 0 || c.avg > 0).sort((a, b) => b.spent - a.spent)

  const biggest = cur.filter((t) => t.kind === 'expense').sort((a, b) => a.amount - b.amount).slice(0, 5)

  const merchants = new Map<string, { name: string; total: number; count: number }>()
  for (const t of cur) {
    if (t.kind !== 'expense') continue
    const key = normalizeDesc(t.description) || t.description.toLowerCase()
    const m = merchants.get(key) ?? { name: titleCase(key) || t.description, total: 0, count: 0 }
    m.total += -t.amount; m.count++
    merchants.set(key, m)
  }
  const topMerchants = [...merchants.values()].sort((a, b) => b.total - a.total).slice(0, 5)

  const start = format(subMonths(startOfMonth(month), 0).getTime() - 86400000, 'yyyy-MM-dd')
  const endDay = endOfMonth(month) > new Date() ? format(new Date(), 'yyyy-MM-dd') : format(endOfMonth(month), 'yyyy-MM-dd')
  const live = accounts.filter((a) => !a.archived && a.include_in_networth)
  const nwStart = live.reduce((s, a) => s + balanceAt(a, start, txs, snaps), 0)
  const nwEnd = live.reduce((s, a) => s + balanceAt(a, endDay, txs, snaps), 0)

  const overBudget = budgets.map((b) => ({ ...b, spent: spent.get(b.category_id) ?? 0 })).filter((b) => b.spent > b.amount)
  const recurringTotal = cur.filter((t) => t.recurring_id).reduce((s, t) => s - t.amount, 0)
  const activeRecurring = recurring.filter((r) => r.active && r.kind === 'expense')

  return { flow, prev, avgIncome, avgExpense, rate, changes, biggest, topMerchants, nwStart, nwEnd, overBudget, recurringTotal, activeRecurring, hasHistory: prevMonths.length > 0 }
}

/** Frasi brevi sul mese: cosa è andato bene, cosa tenere d'occhio. */
export function insightsFor(r: ReturnType<typeof monthReport>, categories: Category[], partialMonth: boolean): Insight[] {
  const out: Insight[] = []
  const name = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Da categorizzare'
  if (r.flow.income > 0) {
    if (r.rate >= 0.2) out.push({ tone: 'good', text: `Hai risparmiato il ${percent(r.rate)} delle entrate: sopra la soglia del 20%.` })
    else if (r.rate < 0 && !partialMonth) out.push({ tone: 'warn', text: `Hai speso ${money(-r.flow.net, true)} più di quanto è entrato.` })
  }
  if (r.hasHistory && r.avgExpense > 0 && !partialMonth) {
    const d = (r.flow.expense - r.avgExpense) / r.avgExpense
    if (d <= -0.1) out.push({ tone: 'good', text: `Uscite in calo del ${percent(-d)} rispetto alla tua media degli ultimi mesi.` })
    else if (d >= 0.15) out.push({ tone: 'warn', text: `Uscite in aumento del ${percent(d)} rispetto alla tua media degli ultimi mesi.` })
  }
  const ups = r.changes.filter((c) => c.avg >= 20 && c.diff >= 25 && c.pct >= 0.3).sort((a, b) => b.diff - a.diff).slice(0, 2)
  ups.forEach((c) => out.push({ tone: 'warn', text: `${name(c.id)}: ${money(c.spent, true)}, il ${percent(c.pct)} in più del solito (+${money(c.diff, true)}).` }))
  const downs = r.changes.filter((c) => c.avg >= 30 && c.diff <= -25 && c.pct <= -0.3).sort((a, b) => a.diff - b.diff).slice(0, 1)
  if (!partialMonth) downs.forEach((c) => out.push({ tone: 'good', text: `${name(c.id)}: ${money(c.diff * -1, true)} in meno del solito.` }))
  r.overBudget.forEach((b) => out.push({ tone: 'warn', text: `Budget superato in ${name(b.category_id)}: ${money(b.spent, true)} su ${money(b.amount, true)}.` }))
  return out.slice(0, 5)
}

/** Avvisi per il mese in corso, con proiezione a fine mese. */
export function liveAlerts(txs: Transaction[], categories: Category[], budgets: Budget[], recurring: Recurring[]): Insight[] {
  const now = new Date()
  const day = now.getDate(), days = getDaysInMonth(now)
  if (day < 5) return []
  const cur = spendByCategory(inMonth(txs, now))
  const prev = [1, 2, 3].map((i) => spendByCategory(inMonth(txs, subMonths(now, i))))
  const out: Insight[] = []
  const name = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Da categorizzare'
  for (const [id, spent] of cur) {
    const avg = avgOf(prev.map((m) => m.get(id) ?? 0))
    const projected = (spent / day) * days
    if (avg >= 30 && projected > avg * 1.4 && spent > avg * 0.6) out.push({ tone: 'warn', text: `${name(id)}: a questo ritmo arrivi a circa ${money(projected, true)} a fine mese, contro una media di ${money(avg, true)}.` })
  }
  for (const b of budgets) {
    const s = cur.get(b.category_id) ?? 0
    if (s >= b.amount * 0.8 && s < b.amount) out.push({ tone: 'warn', text: `${name(b.category_id)}: hai usato l'${percent(s / b.amount)} del budget e mancano ${days - day} giorni.` })
  }
  // Abbonamenti che hanno cambiato prezzo
  for (const r of recurring.filter((x) => x.active && x.kind === 'expense')) {
    const last = txs.find((t) => t.kind === 'expense' && (t.recurring_id === r.id || (r.match_text && t.description.toLowerCase().includes(r.match_text.toLowerCase()))))
    if (last && Math.abs(-last.amount - r.amount) >= Math.max(0.5, r.amount * 0.05)) {
      out.push({ tone: 'info', text: `${r.name} ha addebitato ${money(-last.amount)} invece di ${money(r.amount)}: è cambiato il prezzo?` })
    }
  }
  return out.slice(0, 3)
}
