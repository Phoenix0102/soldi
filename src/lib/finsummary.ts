/* Riepilogo aggregato per il consulente AI: niente movimenti singoli, solo totali e medie. */
import { format, subMonths, startOfMonth } from 'date-fns'
import { avgMonthlyExpense, cashflow, inMonth, merchantKey, monthKey, networth, networthHistory, spendByCategory, titleCase } from './finance'
import { detectSubscriptions } from './subscriptions'
import { round2 } from './format'
import { ACCOUNT_TYPES, type Account, type AccountBalance, type Budget, type Category, type Goal, type Recurring, type Snapshot, type Transaction } from './types'

export interface FinData {
  accounts: Account[]; balances: Map<string, AccountBalance> | undefined; txs: Transaction[]; snaps: Snapshot[]
  categories: Category[]; budgets: Budget[]; goals: Goal[]; recurring: Recurring[]
}

export function buildSummary(d: FinData) {
  const now = new Date()
  const nw = networth(d.accounts, d.balances)
  const cat = (id: string | null) => d.categories.find((c) => c.id === id)?.name ?? 'Senza categoria'
  const active = d.accounts.filter((a) => !a.archived)
  const months = Array.from({ length: 12 }, (_, i) => startOfMonth(subMonths(now, 11 - i)))
  const monthly = months.map((m) => {
    const f = cashflow(inMonth(d.txs, m))
    const byCat = [...spendByCategory(inMonth(d.txs, m)).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    return { mese: monthKey(m), entrate: f.income, uscite: f.expense, risparmio: f.net, categorie: Object.fromEntries(byCat.map(([k, v]) => [cat(k), round2(v)])) }
  })
  const since = format(subMonths(now, 3), 'yyyy-MM-dd')
  const merchants = new Map<string, number>()
  for (const t of d.txs) if (t.kind === 'expense' && t.date >= since) { const k = merchantKey(t.description); merchants.set(k, (merchants.get(k) ?? 0) - t.amount) }
  const subs = detectSubscriptions(d.txs, d.categories).filter((s) => s.active)
  const avgExp = avgMonthlyExpense(d.txs, 3)
  const spentNow = spendByCategory(inMonth(d.txs, now))
  const uncategorized = d.txs.filter((t) => !t.category_id && t.kind !== 'transfer').length

  return {
    data: format(now, 'yyyy-MM-dd'),
    patrimonio: { netto: nw.total, attivita: nw.assets, debiti: nw.debts, liquidita: nw.liquid },
    storicoPatrimonio: networthHistory(d.accounts, d.txs, d.snaps, 12).map((p) => ({ mese: monthKey(p.month), valore: p.value })),
    conti: active.map((a) => ({ nome: a.name, tipo: ACCOUNT_TYPES[a.type].label, saldo: round2(d.balances?.get(a.id)?.balance ?? 0), saldoVerificato: !!d.balances?.get(a.id)?.snapshot_date })),
    mesi: monthly,
    mediaUsciteMensili3m: round2(avgExp),
    fondoEmergenzaMesi: avgExp > 0 ? round2(nw.liquid / avgExp) : null,
    esercentiTop3m: [...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ nome: titleCase(k.toLowerCase()), totale: round2(v) })),
    abbonamenti: { mensile: round2(subs.reduce((s, x) => s + x.monthly, 0)), elenco: subs.slice(0, 12).map((s) => ({ nome: s.name, importo: s.amount, cadenza: s.cadence, aumento: s.hike ? round2(s.hike * 100) + '%' : null })) },
    budget: d.budgets.map((b) => ({ categoria: cat(b.category_id), importo: b.amount, tipo: b.kind ?? 'fixed', spesoQuestoMese: round2(spentNow.get(b.category_id) ?? 0) })),
    ricorrenti: d.recurring.filter((r) => r.active).map((r) => ({ nome: r.name, importo: r.amount, tipo: r.kind, frequenza: r.frequency })),
    obiettivi: d.goals.filter((g) => !g.archived).map((g) => ({ nome: g.name, obiettivo: g.target_amount, accumulato: g.account_id ? round2(d.balances?.get(g.account_id)?.balance ?? 0) : g.saved_amount, scadenza: g.target_date })),
    qualitaDati: { movimenti: d.txs.length, senzaCategoria: uncategorized, contiSenzaSaldo: active.filter((a) => !d.balances?.get(a.id)?.snapshot_date && !d.txs.some((t) => t.account_id === a.id)).length },
  }
}
