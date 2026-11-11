import { useMemo, useState } from 'react'
import { Link } from '../components/nav'
import { subMonths, startOfMonth, parseISO, differenceInCalendarDays } from 'date-fns'
import { Settings, ChevronRight, CalendarClock, GraduationCap } from 'lucide-react'
import { useAccounts, useBalances, useBudgets, useCategories, useRecurring, useSnapshots, useTransactions, useLearnProgress } from '../lib/data'
import { cashflow, inMonth, networth, networthHistory, savingsRate, spendByCategory } from '../lib/finance'
import { money, percent, monthLabel, shortDate } from '../lib/format'
import { Guilloche } from '../components/Guilloche'
import { NetworthSpark, CashflowBars } from '../components/Charts'
import { Badge } from '../components/Icon'
import { TxRow } from '../components/TxRow'
import { BalanceSheet } from '../components/BalanceSheet'
import { Bar, CountMoney, Empty, Money, SkeletonPage } from '../components/ui'
import { useQuickAdd } from '../components/QuickAdd'
import { LESSONS } from '../learn/content'

export default function Dashboard() {
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances } = useBalances()
  const { data: txs = [] } = useTransactions()
  const { data: snaps = [] } = useSnapshots()
  const { data: categories = [] } = useCategories()
  const { data: budgets = [] } = useBudgets()
  const { data: recurring = [] } = useRecurring()
  const { data: progress = [] } = useLearnProgress()
  const qa = useQuickAdd()
  const [balOpen, setBalOpen] = useState(false)

  const now = new Date()
  const nw = useMemo(() => networth(accounts ?? [], balances), [accounts, balances])
  const history = useMemo(() => networthHistory(accounts ?? [], txs, snaps, 12), [accounts, txs, snaps])
  const month = useMemo(() => cashflow(inMonth(txs, now)), [txs]) // eslint-disable-line react-hooks/exhaustive-deps
  const six = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const m = startOfMonth(subMonths(now, 5 - i))
    const c = cashflow(inMonth(txs, m))
    return { month: m, income: c.income, expense: c.expense }
  }), [txs]) // eslint-disable-line react-hooks/exhaustive-deps
  const byCat = useMemo(() => spendByCategory(inMonth(txs, now)), [txs]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !accounts) return <SkeletonPage hero />

  const active = accounts.filter((a) => !a.archived)
  const missing = active.filter((a) => !balances?.get(a.id)?.snapshot_date && !txs.some((t) => t.account_id === a.id))
  const prevMonthValue = history.length > 1 ? history[history.length - 2].value : nw.total
  const delta = nw.total - prevMonthValue
  const investments = active.filter((a) => a.type === 'investment').reduce((s, a) => s + Math.max(0, balances?.get(a.id)?.balance ?? 0), 0)

  const catMap = new Map(categories.map((c) => [c.id, c]))
  const accMap = new Map(accounts.map((a) => [a.id, a]))
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topMax = top[0]?.[1] ?? 0
  const upcoming = recurring.filter((r) => r.active && differenceInCalendarDays(parseISO(r.next_date), now) <= 14).slice(0, 4)
  const doneIds = new Set(progress.map((p) => p.lesson_id))
  const nextLesson = LESSONS.find((l) => !doneIds.has(l.id))
  const rate = savingsRate(month.income, month.expense)

  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-muted capitalize">{monthLabel(now)}</p>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em]">Ciao Jacopo</h1>
        </div>
        <Link to="/impostazioni" className="rounded-full p-2.5 text-muted hover:bg-sunken lg:hidden" aria-label="Impostazioni"><Settings size={22} /></Link>
      </header>

      {/* Patrimonio netto: l'elemento distintivo dell'app */}
      <section className="relative overflow-hidden rounded-[28px] bg-note px-6 pt-6 pb-4 text-note-ink sm:px-8 sm:pt-8">
        <Guilloche className="pointer-events-none absolute -right-28 -top-36 h-[480px] w-[480px] opacity-50" />
        <div className="relative">
          <p className="text-sm opacity-75">Patrimonio netto</p>
          <p className="mt-1 text-[clamp(2.4rem,10vw,4.2rem)] font-semibold leading-none tracking-[-0.04em]"><CountMoney value={nw.total} /></p>
          <p className="num mt-3 text-sm opacity-80">
            {delta >= 0 ? '+' : '−'}{money(Math.abs(delta))} rispetto a fine mese scorso
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-[0.8rem] sm:text-sm">
            <div className="min-w-0"><dt className="truncate opacity-70">Liquidità</dt><dd className="mt-0.5 font-semibold"><CountMoney value={nw.liquid} round /></dd></div>
            <div className="min-w-0"><dt className="truncate opacity-70">Investimenti</dt><dd className="mt-0.5 font-semibold"><CountMoney value={investments} round /></dd></div>
            <div className="min-w-0"><dt className="truncate opacity-70">Debiti</dt><dd className="mt-0.5 font-semibold"><CountMoney value={nw.debts} round /></dd></div>
          </dl>
          <div className="-mx-6 mt-3 sm:-mx-8"><NetworthSpark data={history} /></div>
        </div>
      </section>

      {missing.length > 0 && (
        <button onClick={() => setBalOpen(true)} className="mt-4 flex w-full items-center gap-4 rounded-3xl border border-gold/40 bg-gold/10 p-4 text-left">
          <span className="flex-1">
            <span className="block font-semibold">Imposta i saldi di partenza</span>
            <span className="block text-sm text-muted">{missing.length === 1 ? `Manca il saldo di ${missing[0].name}.` : `Mancano i saldi di ${missing.length} conti.`} Bastano 30 secondi.</span>
          </span>
          <ChevronRight className="text-muted" />
        </button>
      )}
      <BalanceSheet open={balOpen} onClose={() => setBalOpen(false)} />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Questo mese */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Questo mese</h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Entrate" value={month.income} />
            <Stat label="Uscite" value={month.expense} />
            <Stat label="Risparmiato" value={month.net} hint={month.income > 0 ? `${percent(rate)} delle entrate` : undefined} />
          </div>
          <div className="mt-6 rounded-3xl bg-surface p-5"><CashflowBars data={six} /></div>
        </section>

        {/* Dove vanno i soldi */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Dove vanno i soldi</h2>
            <Link to="/piano" className="text-sm font-medium text-muted hover:text-ink">Budget</Link>
          </div>
          {top.length === 0 ? (
            <Empty title="Ancora nessuna spesa questo mese" text="Registra la prima con il tasto + oppure importa l'estratto conto." />
          ) : (
            <ul className="space-y-4">
              {top.map(([cid, amount], i) => {
                const c = cid ? catMap.get(cid) : undefined
                const b = budgets.find((x) => x.category_id === cid)
                return (
                  <li key={cid ?? 'none'} className="rise flex items-center gap-3" style={{ '--i': i } as React.CSSProperties}>
                    <Badge icon={c?.icon ?? 'circle'} color={c?.color ?? '#94a3b8'} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{c?.name ?? 'Da categorizzare'}</span>
                        <span className="num shrink-0 font-semibold">{money(amount)}{b && <span className="font-normal text-muted"> / {money(b.amount, true)}</span>}</span>
                      </div>
                      <div className="mt-1.5">
                        <Bar value={amount} max={b ? b.amount : topMax} tone={b && amount > b.amount ? 'neg' : b && amount > b.amount * 0.8 ? 'warn' : 'brand'} thin />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {upcoming.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><CalendarClock size={19} /> In arrivo</h2>
              <ul className="divide-y divide-line rounded-3xl bg-surface px-4">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                    <span><span className="font-medium">{r.name}</span><span className="block text-muted">{shortDate(r.next_date)}</span></span>
                    <Money value={r.kind === 'expense' ? -r.amount : r.amount} signed className="font-semibold" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Ultimi movimenti</h2>
            <Link to="/movimenti" className="text-sm font-medium text-muted hover:text-ink">Vedi tutti</Link>
          </div>
          {txs.length === 0 ? (
            <Empty title="Nessun movimento" text="Aggiungi la tua prima spesa: ci vogliono pochi secondi." action={<button onClick={() => qa.open()} className="btn btn-primary">Nuovo movimento</button>} />
          ) : (
            <div className="-mx-2">{txs.slice(0, 6).map((t, i) => <div key={t.id} className="rise" style={{ '--i': i } as React.CSSProperties}><TxRow t={t} cat={t.category_id ? catMap.get(t.category_id) : undefined} acc={accMap.get(t.account_id)} /></div>)}</div>
          )}
        </section>

        <section className="space-y-8">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Conti</h2>
              <Link to="/conti" className="text-sm font-medium text-muted hover:text-ink">Gestisci</Link>
            </div>
            <ul>
              {active.map((a) => (
                <li key={a.id}>
                  <Link to={`/conti/${a.id}`} className="press -mx-2 flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-sunken">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                    <span className="flex-1 truncate">{a.name}</span>
                    <Money value={balances?.get(a.id)?.balance ?? 0} className="font-medium" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {nextLesson && (
            <Link to={`/impara/${nextLesson.id}`} className="press block rounded-3xl bg-brand-soft p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex items-center gap-2 text-sm text-muted"><GraduationCap size={16} /> Prossima lezione, {nextLesson.minutes} minuti</span>
              <span className="mt-1 block text-lg font-semibold leading-snug">{nextLesson.title}</span>
              <span className="mt-1 block text-sm text-muted">{nextLesson.summary}</span>
            </Link>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-3xl bg-surface p-3.5 sm:p-4">
      <p className="truncate text-[0.8rem] text-muted sm:text-sm">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold tracking-[-0.01em] sm:text-xl ${value < 0 ? 'text-neg' : ''}`}><CountMoney value={value} round /></p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}
