import { useMemo, useState } from 'react'
import { addMonths, isSameMonth, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Printer, TrendingDown, TrendingUp, Sparkles, AlertTriangle, Info } from 'lucide-react'
import { useAccounts, useBudgets, useCategories, useGoals, useBalances, useRecurring, useSnapshots, useTransactions } from '../lib/data'
import { insightsFor, monthReport } from '../lib/insights'
import { monthKey } from '../lib/finance'
import { money, monthLabel, percent, shortDate } from '../lib/format'
import { Badge } from '../components/Icon'
import { Bar, CountMoney, Empty, SkeletonPage } from '../components/ui'
import { CashflowBars } from '../components/Charts'
import { BackButton } from '../components/back'
import { cashflow as flowOf, inMonth } from '../lib/finance'
import { startOfMonth } from 'date-fns'

export default function Report() {
  const { data: txs, isLoading } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: snaps = [] } = useSnapshots()
  const { data: budgets = [] } = useBudgets()
  const { data: recurring = [] } = useRecurring()
  const { data: categories = [] } = useCategories()
  const { data: goals = [] } = useGoals()
  const { data: balances } = useBalances()
  const [month, setMonth] = useState(() => (new Date().getDate() <= 5 ? subMonths(new Date(), 1) : new Date()))

  const r = useMemo(() => monthReport(month, txs ?? [], accounts, snaps, budgets, recurring), [month, txs, accounts, snaps, budgets, recurring])
  const six = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const m = startOfMonth(subMonths(month, 5 - i))
    const c = flowOf(inMonth(txs ?? [], m))
    return { month: m, income: c.income, expense: c.expense }
  }), [txs, month])
  if (isLoading) return <SkeletonPage />

  const partial = isSameMonth(month, new Date())
  const insights = insightsFor(r, categories, partial)
  const cat = (id: string | null) => categories.find((c) => c.id === id)
  const maxCat = Math.max(1, ...r.changes.map((c) => Math.max(c.spent, c.avg)))
  const nwDelta = r.nwEnd - r.nwStart
  const empty = r.flow.income === 0 && r.flow.expense === 0
  const delta = (cur: number, ref: number) => (ref > 0 ? (cur - ref) / ref : null)

  return (
    <div className="report">
      <div className="no-print"><BackButton label="Home" /></div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted">Resoconto{partial ? ' (mese in corso)' : ''}</p>
          <h1 className="text-[1.9rem] font-semibold capitalize leading-tight tracking-[-0.02em]">{monthLabel(month)}</h1>
        </div>
        <div className="no-print flex items-center gap-2">
          <div className="flex items-center rounded-full bg-surface">
            <button className="rounded-full p-2.5 hover:bg-sunken" onClick={() => setMonth(subMonths(month, 1))} aria-label="Mese precedente"><ChevronLeft size={18} /></button>
            <button className="rounded-full p-2.5 hover:bg-sunken disabled:opacity-30" disabled={monthKey(month) >= monthKey(new Date())} onClick={() => setMonth(addMonths(month, 1))} aria-label="Mese successivo"><ChevronRight size={18} /></button>
          </div>
          <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={16} /> PDF</button>
        </div>
      </header>

      {empty ? <Empty title="Nessun movimento in questo mese" text="Scegli un altro mese o importa l'estratto conto." /> : (
        <>
          <section className="relative overflow-hidden rounded-[28px] bg-note p-6 text-note-ink sm:p-8">
            <p className="text-sm opacity-75">Hai risparmiato</p>
            <p className="mt-1 text-[clamp(2.4rem,9vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]"><CountMoney value={r.flow.net} /></p>
            {r.flow.income > 0 && <p className="mt-2 opacity-80">il {percent(r.rate)} di quello che è entrato</p>}
            <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-[0.8rem] sm:text-sm">
              <Fig label="Entrate" value={r.flow.income} d={delta(r.flow.income, r.avgIncome)} />
              <Fig label="Uscite" value={r.flow.expense} d={delta(r.flow.expense, r.avgExpense)} invert />
              <div className="min-w-0"><dt className="truncate opacity-70">Patrimonio</dt><dd className="num mt-0.5 font-semibold">{nwDelta >= 0 ? '+' : '−'}{money(Math.abs(nwDelta), true)}</dd></div>
            </dl>
            {r.hasHistory && <p className="mt-3 text-xs opacity-60">Le percentuali confrontano con la media dei 3 mesi precedenti.</p>}
          </section>

          {insights.length > 0 && (
            <section className="mt-6 space-y-2">
              {insights.map((i, k) => (
                <div key={k} className="rise flex items-start gap-3 rounded-2xl bg-surface px-4 py-3.5" style={{ '--i': k } as React.CSSProperties}>
                  {i.tone === 'good' ? <Sparkles size={18} className="mt-0.5 shrink-0 text-pos" /> : i.tone === 'warn' ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-gold" /> : <Info size={18} className="mt-0.5 shrink-0 text-muted" />}
                  <p className="text-[0.95rem]">{i.text}</p>
                </div>
              ))}
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Gli ultimi 6 mesi</h2>
            <div className="rounded-3xl bg-surface p-5"><CashflowBars data={six} /></div>
          </section>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section>
              <h2 className="mb-1 text-lg font-semibold">Categorie</h2>
              <p className="mb-4 text-sm text-muted">Barra: questo mese. Tacca: la tua media.</p>
              <ul className="space-y-4">
                {r.changes.slice(0, 10).map((c, i) => {
                  const k = cat(c.id)
                  return (
                    <li key={c.id ?? 'none'} className="rise flex items-center gap-3" style={{ '--i': i } as React.CSSProperties}>
                      <Badge icon={k?.icon ?? 'circle'} color={k?.color ?? '#94a3b8'} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{k?.name ?? 'Da categorizzare'}</span>
                          <span className="num shrink-0">
                            <strong>{money(c.spent, true)}</strong>
                            {r.hasHistory && c.avg > 0 && Math.abs(c.pct) >= 0.01 && <span className={`ml-1.5 text-xs ${c.diff > 0 ? 'text-gold' : 'text-pos'}`}>{c.diff > 0 ? '+' : '−'}{percent(Math.abs(c.pct))}</span>}
                          </span>
                        </div>
                        <div className="relative mt-1.5">
                          <Bar value={c.spent} max={maxCat} thin tone={r.hasHistory && c.diff > c.avg * 0.3 && c.avg > 0 ? 'warn' : 'brand'} />
                          {r.hasHistory && c.avg > 0 && <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink/60" style={{ left: `${(c.avg / maxCat) * 100}%` }} />}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="space-y-8">
              <div>
                <h2 className="mb-2 text-lg font-semibold">Spese più grandi</h2>
                <ul className="divide-y divide-line rounded-3xl bg-surface px-4">
                  {r.biggest.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="min-w-0"><span className="block truncate font-medium">{t.description}</span><span className="text-muted">{shortDate(t.date)}, {cat(t.category_id)?.name ?? 'Da categorizzare'}</span></span>
                      <span className="num shrink-0 font-semibold">{money(-t.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="mb-2 text-lg font-semibold">Dove hai speso di più</h2>
                <ul className="divide-y divide-line rounded-3xl bg-surface px-4">
                  {r.topMerchants.map((m) => (
                    <li key={m.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="min-w-0"><span className="block truncate font-medium">{m.name}</span><span className="text-muted">{m.count} {m.count === 1 ? 'volta' : 'volte'}</span></span>
                      <span className="num shrink-0 font-semibold">{money(m.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {(goals.some((g) => !g.archived) || r.activeRecurring.length > 0) && (
                <div>
                  <h2 className="mb-2 text-lg font-semibold">Obiettivi e spese fisse</h2>
                  <ul className="space-y-3 rounded-3xl bg-surface p-4 text-sm">
                    {goals.filter((g) => !g.archived).map((g) => {
                      const saved = g.account_id ? Math.max(0, balances?.get(g.account_id)?.balance ?? 0) : g.saved_amount
                      return (
                        <li key={g.id}>
                          <div className="flex justify-between"><span className="font-medium">{g.name}</span><span className="num">{percent(saved / g.target_amount)}</span></div>
                          <div className="mt-1.5"><Bar value={saved} max={g.target_amount} thin tone={saved >= g.target_amount ? 'gold' : 'brand'} /></div>
                        </li>
                      )
                    })}
                    {r.activeRecurring.length > 0 && (
                      <li className="flex justify-between border-t border-line pt-3">
                        <span className="text-muted">Spese fisse registrate nel mese</span>
                        <span className="num font-semibold">{money(r.recurringTotal)}</span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Fig({ label, value, d, invert }: { label: string; value: number; d: number | null; invert?: boolean }) {
  const good = d !== null && (invert ? d < 0 : d > 0)
  return (
    <div className="min-w-0">
      <dt className="truncate opacity-70">{label}</dt>
      <dd className="num mt-0.5 font-semibold">{money(value, true)}</dd>
      {d !== null && Math.abs(d) >= 0.01 && (
        <dd className={`mt-0.5 inline-flex items-center gap-1 text-xs ${good ? 'opacity-90' : 'opacity-70'}`}>
          {d > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{percent(Math.abs(d))}
        </dd>
      )}
    </div>
  )
}
