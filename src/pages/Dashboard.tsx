import { useEffect, useMemo, useState } from 'react'
import { Link, useGo } from '../components/nav'
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { Settings, ChevronRight, CalendarClock, GraduationCap, FileBarChart, AlertTriangle, Info, Sparkles, Scale, TrendingUp, Telescope } from 'lucide-react'
import { liveAlerts } from '../lib/insights'
import { useAccounts, useBalances, useBudgets, useCategories, useRecurring, useSnapshots, useTransactions, useHoldings } from '../lib/data'
import { useRefreshQuotes } from '../components/Portfolio'
import { useAppSettings, useBankConnections } from '../lib/data'
import { useBankSync } from '../components/BankSetup'
import { cashflow, inMonth, monthEndForecast, networth, networthHistory, savingsRate, spendByCategory } from '../lib/finance'
import { detectSubscriptions } from '../lib/subscriptions'
import { money, percent, monthLabel, shortDate } from '../lib/format'
import { Badge } from '../components/Icon'
import { TxRow } from '../components/TxRow'
import { BalanceSheet } from '../components/BalanceSheet'
import { NetworthSummary } from '../components/NetworthCard'
import { Bar, CountMoney, Empty, Money, SkeletonPage } from '../components/ui'
import { useQuickAdd } from '../components/QuickAdd'
import { SwipeDismiss, DismissX, dismissedSet, dismissKey } from '../components/SwipeDismiss'
import { updateWidget } from '../lib/widget'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export default function Dashboard() {
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances } = useBalances()
  const { data: txs = [] } = useTransactions()
  const { data: snaps = [] } = useSnapshots()
  const { data: categories = [] } = useCategories()
  const { data: budgets = [] } = useBudgets()
  const { data: recurring = [] } = useRecurring()
  const qa = useQuickAdd()
  const [balOpen, setBalOpen] = useState(false)
  const [dismissed, setDismissed] = useState(dismissedSet)
  const [allTodos, setAllTodos] = useState(false)
  const hide = (k: string) => { dismissKey(k); setDismissed(dismissedSet()) }
  const { data: settings, isFetched: settingsReady } = useAppSettings()
  const go = useGo()
  const { isFetched: txReady } = useTransactions()
  const { isFetched: snapsReady } = useSnapshots()
  // Primo avvio: nessun saldo e nessun movimento → configurazione guidata
  useEffect(() => {
    if (!settingsReady || !txReady || !snapsReady) return
    if (localStorage.getItem('soldi-onboarded') || settings?.data?.onboarded) return
    if (!txs.length && !snaps.length) go('/benvenuto', { replace: true })
  }, [settingsReady, txReady, snapsReady]) // eslint-disable-line react-hooks/exhaustive-deps
  const { data: conns = [], isFetched: connsReady } = useBankConnections()
  const bankSync = useBankSync()
  // Banche collegate: se l'ultimo aggiornamento ha più di 6 ore lo rifaccio in background
  useEffect(() => {
    if (!connsReady) return
    const act = conns.filter((c) => c.status === 'active')
    if (act.length && act.some((c) => !c.last_sync_at || Date.now() - +new Date(c.last_sync_at) > 6 * 3600_000)) bankSync().catch(() => {})
  }, [connsReady]) // eslint-disable-line react-hooks/exhaustive-deps
  const { data: holdings = [], isFetched: holdingsReady } = useHoldings()
  const refreshQuotes = useRefreshQuotes()
  // Il valore degli investimenti si aggiorna da solo se le quotazioni hanno più di 3 ore
  useEffect(() => {
    if (!holdingsReady || !holdings.length) return
    const oldest = Math.min(...holdings.map((h) => (h.last_price_at ? +new Date(h.last_price_at) : 0)))
    if (Date.now() - oldest > 3 * 3600_000) refreshQuotes().catch(() => {})
  }, [holdingsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date()
  const nw = useMemo(() => networth(accounts ?? [], balances), [accounts, balances])
  const history = useMemo(() => networthHistory(accounts ?? [], txs, snaps, 12), [accounts, txs, snaps])
  const month = useMemo(() => cashflow(inMonth(txs, now)), [txs]) // eslint-disable-line react-hooks/exhaustive-deps
  const byCat = useMemo(() => spendByCategory(inMonth(txs, now)), [txs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Widget della schermata Home: patrimonio, mese, budget
  const prevValue = history.length > 1 ? history[history.length - 2].value : nw.total
  const budgetSpent = budgets.reduce((s, b) => s + (byCat.get(b.category_id) ?? 0), 0)
  const budgetTotal = budgets.reduce((s, b) => s + b.amount, 0)
  useEffect(() => {
    if (!accounts) return
    const m = format(new Date(), 'LLLL', { locale: it })
    updateWidget({ networth: nw.total, delta: nw.total - prevValue, monthExpense: month.expense, monthIncome: month.income, budgetSpent, budgetTotal, month: m.charAt(0).toUpperCase() + m.slice(1) })
  }, [accounts, nw.total, prevValue, month.expense, month.income, budgetSpent, budgetTotal])

  if (isLoading || !accounts) return <SkeletonPage hero />

  const active = accounts.filter((a) => !a.archived)
  const missing = active.filter((a) => !balances?.get(a.id)?.snapshot_date && !txs.some((t) => t.account_id === a.id))
  const investments = active.filter((a) => a.type === 'investment').reduce((s, a) => s + Math.max(0, balances?.get(a.id)?.balance ?? 0), 0)

  const catMap = new Map(categories.map((c) => [c.id, c]))
  const accMap = new Map(accounts.map((a) => [a.id, a]))
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const topMax = top[0]?.[1] ?? 0
  const upcoming = recurring.filter((r) => r.active && differenceInCalendarDays(parseISO(r.next_date), now) <= 14).sort((a, b) => a.next_date.localeCompare(b.next_date)).slice(0, 3)
  const rate = savingsRate(month.income, month.expense)
  const toSort = txs.filter((t) => !t.category_id && t.kind !== 'transfer').length
  const alerts = liveAlerts(txs, categories, budgets, recurring)
  const reportMonth = now.getDate() <= 5 ? 'del mese scorso' : 'di questo mese'
  const hikes = detectSubscriptions(txs, categories).filter((x) => x.active && x.hike)
  const forecast = monthEndForecast(nw.liquid, txs, recurring)
  // Ogni avviso ha una chiave legata al suo contenuto: se lo togli torna solo quando cambia qualcosa
  type Todo = { key: string; icon: React.ReactNode; tone: string; title: string; text?: string; open?: () => void }
  const todos: Todo[] = []
  if (toSort > 0) todos.push({ key: `sort:${toSort}`, icon: <Sparkles size={19} />, tone: 'bg-brand text-brand-ink',
    title: toSort === 1 ? 'Un movimento da smistare' : `${toSort} movimenti da smistare`, text: 'Assegna una categoria, un tocco per esercente', open: () => go('/smista') })
  if (missing.length) todos.push({ key: `missing:${missing.map((a) => a.id).join(',')}`, icon: <Scale size={19} />, tone: 'bg-gold/15 text-gold',
    title: missing.length === 1 ? `Saldo di ${missing[0].name}` : `${missing.length} conti senza saldo`, text: 'Scrivi quanto c\'è oggi', open: () => setBalOpen(true) })
  if (hikes.length) todos.push({ key: `hike:${hikes.map((h) => `${h.name}${h.amount}`).join(',')}`, icon: <TrendingUp size={19} />, tone: 'bg-gold/15 text-gold',
    title: hikes.length === 1 ? `${hikes[0].name} è aumentato` : `${hikes.length} abbonamenti aumentati`,
    text: hikes.length === 1 ? `Ora ${money(hikes[0].amount)} invece di ${money(hikes[0].previous ?? 0)}` : 'Controlla se ti servono ancora', open: () => go('/abbonamenti') })
  // Gli avvisi sui prezzi cambiati sono già nella riga degli aumenti
  for (const a of alerts) {
    if (hikes.some((h) => a.text.startsWith(h.name)) && /invece di/.test(a.text)) continue
    todos.push({ key: `alert:${format(now, 'yyyy-MM')}:${a.text.split(/[:,]/)[0]}:${a.text.includes('budget') ? 'b' : 'p'}`, icon: a.tone === 'info' ? <Info size={19} /> : <AlertTriangle size={19} />, tone: a.tone === 'info' ? 'bg-sunken text-muted' : 'bg-gold/15 text-gold', title: a.text })
  }
  const visibleTodos = todos.filter((t) => !dismissed.has(t.key))
  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted capitalize">{monthLabel(now)}</p>
          <h1 className="text-[1.9rem] leading-tight font-semibold tracking-[-0.02em]">Ciao Jacopo</h1>
        </div>
        <div className="flex gap-1">
          <Link to="/impara" className="icon-btn" aria-label="Impara"><GraduationCap size={21} /></Link>
          <Link to="/impostazioni" className="icon-btn" aria-label="Impostazioni"><Settings size={21} /></Link>
        </div>
      </header>

      <NetworthSummary total={nw.total} delta={nw.total - prevValue} liquid={nw.liquid} investments={investments} debts={nw.debts}
        series={history} onOpen={() => go('/patrimonio')} />


      {/* Da fare: tutto quello che chiede un'azione, in un posto solo. X o scorri a sinistra per toglierlo */}
      {visibleTodos.length > 0 && (
        <section className="mt-6">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Da fare</h2>
            {visibleTodos.length > 3 && <button onClick={() => setAllTodos(!allTodos)} className="text-sm font-medium text-brand">{allTodos ? 'Meno' : `Tutti (${visibleTodos.length})`}</button>}
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
            {(allTodos ? visibleTodos : visibleTodos.slice(0, 3)).map((t) => (
              <li key={t.key}>
                <SwipeDismiss label={`Togli: ${t.title}`} onDismiss={() => hide(t.key)}>
                  {(dismiss) => (
                    <div className="flex items-center gap-3 py-3 pr-3 pl-4">
                      <button onClick={t.open} disabled={!t.open} className="press flex min-w-0 flex-1 items-center gap-3.5 text-left">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${t.tone}`}>{t.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block leading-snug ${t.text ? 'font-semibold' : 'text-[0.92rem]'}`}>{t.title}</span>
                          {t.text && <span className="block text-sm text-muted">{t.text}</span>}
                        </span>
                      </button>
                      <DismissX label={`Togli: ${t.title}`} onClick={dismiss} />
                    </div>
                  )}
                </SwipeDismiss>
              </li>
            ))}
          </ul>
        </section>
      )}
      <BalanceSheet open={balOpen} onClose={() => setBalOpen(false)} />

      {/* Questo mese */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Questo mese</h2>
          <Link to="/resoconto" className="inline-flex items-center gap-1 text-sm font-medium text-brand"><FileBarChart size={15} /> Resoconto {reportMonth}</Link>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Entrate" value={month.income} tone="pos" />
          <Stat label="Uscite" value={month.expense} />
          <Stat label="Risparmiato" value={month.net} hint={month.income > 0 ? `${percent(rate)} delle entrate` : undefined} />
        </div>

        {forecast.daysLeft > 0 && (
          <p className="mt-2.5 flex items-center gap-2 px-1 text-sm text-muted">
            <Telescope size={16} className="shrink-0 text-brand" />
            <span>A fine mese avrai circa <strong className={`num font-semibold ${forecast.value < 0 ? 'text-neg' : 'text-ink'}`}>{money(forecast.value, true)}</strong> sui conti</span>
          </p>
        )}

        <div className="mt-2.5 rounded-3xl bg-surface p-5">
          {top.length === 0 ? (
            <Empty title="Ancora nessuna spesa questo mese" text="Registra la prima con il tasto + oppure importa l'estratto conto." />
          ) : (
            <ul className="space-y-4">
              {top.map(([cid, amount]) => {
                const c = cid ? catMap.get(cid) : undefined
                const b = budgets.find((x) => x.category_id === cid)
                return (
                  <li key={cid ?? 'none'} className="flex items-center gap-3">
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
          <Link to="/piano" className="mt-4 flex items-center justify-between border-t border-line pt-3.5 text-sm font-medium text-muted">
            Budget e obiettivi <ChevronRight size={16} />
          </Link>
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock size={19} /> In arrivo</h2>
            <Link to="/abbonamenti" className="text-sm font-medium text-brand">Spese fisse</Link>
          </div>
          <ul className="divide-y divide-line rounded-3xl bg-surface px-4">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                <span><span className="font-medium">{r.name}</span><span className="block text-muted">{shortDate(r.next_date)}</span></span>
                <Money value={r.kind === 'expense' ? -r.amount : r.amount} signed className="font-semibold" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Ultimi movimenti</h2>
          <Link to="/movimenti" className="text-sm font-medium text-brand">Vedi tutti</Link>
        </div>
        {txs.length === 0 ? (
          <Empty title="Nessun movimento" text="Aggiungi la tua prima spesa: ci vogliono pochi secondi." action={<button onClick={() => qa.open()} className="btn btn-primary">Nuovo movimento</button>} />
        ) : (
          <div className="-mx-2">{txs.slice(0, 5).map((t) => <TxRow key={t.id} t={t} cat={t.category_id ? catMap.get(t.category_id) : undefined} acc={accMap.get(t.account_id)} />)}</div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'pos' }) {
  return (
    <div className="min-w-0 rounded-3xl bg-surface px-3.5 py-3.5">
      <p className="truncate text-[0.78rem] text-muted">{label}</p>
      <p className={`mt-0.5 truncate text-[1.05rem] font-semibold tracking-[-0.01em] ${value < 0 ? 'text-neg' : tone === 'pos' ? 'text-pos' : ''}`}><CountMoney value={value} round /></p>
      {hint && <p className="mt-0.5 truncate text-[0.7rem] text-muted">{hint}</p>}
    </div>
  )
}
