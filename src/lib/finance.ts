import { addMonths, addWeeks, addYears, endOfMonth, format, parseISO, startOfMonth, subMonths, differenceInCalendarMonths } from 'date-fns'
import type { Account, AccountBalance, Category, Frequency, Recurring, Rule, Snapshot, Transaction } from './types'
import { ACCOUNT_TYPES, FREQUENCIES } from './types'
import { round2 } from './format'

export const isExpense = (t: Transaction) => t.kind === 'expense'
export const isIncome = (t: Transaction) => t.kind === 'income'

export function monthKey(d: Date | string) {
  return typeof d === 'string' ? d.slice(0, 7) : format(d, 'yyyy-MM')
}

export function inMonth(txs: Transaction[], month: Date) {
  const k = monthKey(month)
  return txs.filter((t) => t.date.startsWith(k))
}

export function cashflow(txs: Transaction[]) {
  let income = 0, expense = 0
  for (const t of txs) {
    if (t.kind === 'income') income += t.amount
    else if (t.kind === 'expense') expense += -t.amount
  }
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) }
}

export function savingsRate(income: number, expense: number) {
  return income > 0 ? (income - expense) / income : 0
}

export function spendByCategory(txs: Transaction[]) {
  const m = new Map<string | null, number>()
  for (const t of txs) if (t.kind === 'expense') m.set(t.category_id, (m.get(t.category_id) ?? 0) - t.amount)
  return m
}

/** Media delle uscite mensili sugli ultimi N mesi completi (o parziali se non ce ne sono). */
export function avgMonthlyExpense(txs: Transaction[], months = 3) {
  const now = new Date()
  const totals: number[] = []
  for (let i = 1; i <= months; i++) {
    const m = subMonths(now, i)
    const { expense } = cashflow(inMonth(txs, m))
    if (expense > 0) totals.push(expense)
  }
  if (!totals.length) {
    const cur = cashflow(inMonth(txs, now)).expense
    return cur
  }
  return totals.reduce((a, b) => a + b, 0) / totals.length
}

export function networth(accounts: Account[], balances: Map<string, AccountBalance> | undefined) {
  let assets = 0, debts = 0, liquid = 0
  for (const a of accounts) {
    if (a.archived || !a.include_in_networth) continue
    const b = balances?.get(a.id)?.balance ?? 0
    if (b < 0) debts += -b
    else assets += b
    if (ACCOUNT_TYPES[a.type].liquid && b > 0) liquid += b
  }
  return { total: round2(assets - debts), assets: round2(assets), debts: round2(debts), liquid: round2(liquid) }
}

/** Saldo di un conto a fine giornata `day`, ricostruito da snapshot + movimenti. */
export function balanceAt(account: Account, day: string, txs: Transaction[], snaps: Snapshot[]) {
  const own = snaps.filter((s) => s.account_id === account.id).sort((a, b) => a.date.localeCompare(b.date))
  const tx = txs.filter((t) => t.account_id === account.id)
  const before = own.filter((s) => s.date <= day).pop()
  if (before) return before.balance + tx.filter((t) => t.date > before.date && t.date <= day).reduce((s, t) => s + t.amount, 0)
  const after = own[0]
  if (after) return after.balance - tx.filter((t) => t.date > day && t.date <= after.date).reduce((s, t) => s + t.amount, 0)
  return account.initial_balance + tx.filter((t) => t.date <= day).reduce((s, t) => s + t.amount, 0)
}

export function networthHistory(accounts: Account[], txs: Transaction[], snaps: Snapshot[], months = 12) {
  const active = accounts.filter((a) => !a.archived && a.include_in_networth)
  const out: { month: Date; value: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = subMonths(new Date(), i)
    const day = i === 0 ? format(new Date(), 'yyyy-MM-dd') : format(endOfMonth(m), 'yyyy-MM-dd')
    const value = active.reduce((s, a) => s + balanceAt(a, day, txs, snaps), 0)
    out.push({ month: startOfMonth(m), value: round2(value) })
  }
  return out
}

export type Period = '3m' | '6m' | '1y' | 'all'

/** Serie del patrimonio per il grafico: settimanale sui periodi brevi, mensile su quelli lunghi. */
export function networthSeries(accounts: Account[], txs: Transaction[], snaps: Snapshot[], period: Period) {
  const active = accounts.filter((a) => !a.archived && a.include_in_networth)
  const today = new Date()
  const first = txs.length ? parseISO(txs[txs.length - 1].date) : subMonths(today, 12)
  const months = period === '3m' ? 3 : period === '6m' ? 6 : period === '1y' ? 12 : Math.max(3, differenceInCalendarMonths(today, first) + 1)
  const start = subMonths(today, months)
  const weekly = period === '3m'
  const days: Date[] = []
  if (weekly) {
    for (let d = start; d < today; d = addWeeks(d, 1)) days.push(d)
  } else {
    for (let i = months - 1; i >= 1; i--) days.push(endOfMonth(subMonths(today, i)))
  }
  days.push(today)
  return days.map((d) => {
    const day = format(d, 'yyyy-MM-dd')
    return { date: d, value: round2(active.reduce((s, a) => s + balanceAt(a, day, txs, snaps), 0)) }
  })
}

/** Variazione del patrimonio mese per mese (fine mese su fine mese precedente). */
export function monthlyChanges(accounts: Account[], txs: Transaction[], snaps: Snapshot[], months = 6) {
  const h = networthHistory(accounts, txs, snaps, months + 1)
  return h.slice(1).map((p, i) => ({ month: p.month, change: round2(p.value - h[i].value) }))
}

/**
 * Previsione di fine mese per la liquidità: saldo di oggi, meno le spese ricorrenti ancora attese,
 * più le entrate ricorrenti, meno la spesa variabile media per i giorni che mancano.
 */
export function monthEndForecast(liquidNow: number, txs: Transaction[], recurring: Recurring[]) {
  const today = new Date()
  const end = endOfMonth(today)
  const daysLeft = Math.max(0, Math.round((+end - +today) / 86400000))
  const endIso = format(end, 'yyyy-MM-dd'), todayIso = format(today, 'yyyy-MM-dd')
  let fixed = 0
  for (const r of recurring) {
    if (!r.active || r.next_date <= todayIso || r.next_date > endIso) continue
    fixed += r.kind === 'income' ? r.amount : -r.amount
  }
  // Spesa variabile giornaliera: media degli ultimi 3 mesi, esclusi gli addebiti ricorrenti già noti
  const known = recurring.map((r) => (r.match_text || r.name).toLowerCase())
  const since = format(subMonths(today, 3), 'yyyy-MM-dd')
  const variable = txs.filter((t) => t.kind === 'expense' && t.date >= since && t.date < todayIso && !known.some((k) => k && t.description.toLowerCase().includes(k)))
  const daily = variable.reduce((s, t) => s - t.amount, 0) / 90
  const value = round2(liquidNow + fixed - daily * daysLeft)
  return { value, daysLeft, fixed: round2(fixed), variable: round2(daily * daysLeft) }
}

/* ---------- Ricorrenti ---------- */

export function advance(dateIso: string, f: Frequency) {
  const d = parseISO(dateIso)
  const n = f === 'weekly' ? addWeeks(d, 1) : f === 'monthly' ? addMonths(d, 1) : f === 'quarterly' ? addMonths(d, 3) : addYears(d, 1)
  return format(n, 'yyyy-MM-dd')
}

export const monthlyEquivalent = (r: Recurring) => r.amount * FREQUENCIES[r.frequency].perMonth

/** Cerca movimenti con descrizione e importo simili ripetuti in almeno 3 mesi diversi. */
export function detectRecurring(txs: Transaction[], existing: Recurring[]) {
  const known = existing.map((r) => (r.match_text || r.name).toLowerCase())
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.kind !== 'expense') continue
    const key = normalizeDesc(t.description)
    if (!key || key.length < 3) continue
    const g = groups.get(key) ?? []
    g.push(t)
    groups.set(key, g)
  }
  const out: { key: string; name: string; amount: number; months: number; last: Transaction }[] = []
  for (const [key, g] of groups) {
    const months = new Set(g.map((t) => t.date.slice(0, 7)))
    if (months.size < 3) continue
    const amounts = g.map((t) => -t.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    const similar = amounts.filter((a) => Math.abs(a - median) <= Math.max(1, median * 0.1)).length
    if (similar / amounts.length < 0.6) continue
    if (known.some((k) => key.includes(k) || k.includes(key))) continue
    out.push({ key, name: titleCase(key), amount: round2(median), months: months.size, last: g[0] })
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 8)
}

/* ---------- Testo e regole ---------- */

export function normalizeDesc(s: string) {
  return s
    .toLowerCase()
    .replace(/\d{2}[/.-]\d{2}([/.-]\d{2,4})?/g, ' ')
    .replace(/\b(pagamento|pos|carta|card|n\.?|nr|addebito|sdd|bonifico|a favore di|presso|del|ore|\*+)\b/g, ' ')
    .replace(/[0-9*#]+/g, ' ')
    .replace(/[^a-zà-ú.& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ')
}

export const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase())

export function applyRules(description: string, rules: Rule[], categories: Category[], amount: number) {
  const up = ` ${description.toUpperCase()} `
  const wantKind = amount >= 0 ? 'income' : 'expense'
  const sorted = [...rules].sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length)
  for (const r of sorted) {
    if (!r.pattern) continue
    if (up.includes(r.pattern.toUpperCase())) {
      const action = r.action ?? 'category'
      if (action === 'transfer') return { action, category_id: null, target_account_id: null, rename_to: r.rename_to }
      if (action === 'debt') {
        if (amount >= 0 || !r.target_account_id) continue
        return { action, category_id: null, target_account_id: r.target_account_id, rename_to: r.rename_to }
      }
      const cat = categories.find((c) => c.id === r.category_id)
      if (cat && cat.kind !== wantKind) continue
      return { action, category_id: r.category_id, target_account_id: null, rename_to: r.rename_to }
    }
  }
  return null
}

/** Suggerisce la categoria guardando movimenti passati con descrizione simile. */
export function suggestFromHistory(description: string, txs: Transaction[]) {
  const key = normalizeDesc(description)
  if (key.length < 3) return null
  const hit = txs.find((t) => t.category_id && normalizeDesc(t.description) === key)
  return hit?.category_id ?? null
}

export function monthsLeft(targetDate: string | null) {
  if (!targetDate) return null
  return Math.max(1, differenceInCalendarMonths(parseISO(targetDate), new Date()))
}

/* ---------- Simulazioni ---------- */

export function compound(monthly: number, years: number, annualRate: number, initial = 0) {
  const r = annualRate / 12
  const n = years * 12
  let v = initial
  const series: { year: number; value: number; invested: number }[] = [{ year: 0, value: initial, invested: initial }]
  for (let i = 1; i <= n; i++) {
    v = v * (1 + r) + monthly
    if (i % 12 === 0) series.push({ year: i / 12, value: round2(v), invested: round2(initial + monthly * i) })
  }
  return series
}

/** Chiave di raggruppamento per lo smistamento: esercente ripulito, o la descrizione se non resta nulla. */
export function merchantKey(description: string) {
  return ruleKeyFor(description) || normalizeDesc(description).toUpperCase() || description.trim().toUpperCase() || '(SENZA DESCRIZIONE)'
}

/** Parola chiave per una regola: il nome dell'esercente ripulito (1 o 2 parole). */
export function ruleKeyFor(description: string) {
  const words = normalizeDesc(description).split(' ').filter((w) => w.length > 1)
  if (!words.length) return ''
  const key = words[0].length >= 4 || words.length === 1 ? words[0] : `${words[0]} ${words[1]}`
  return key.toUpperCase()
}
