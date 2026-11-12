import { useMemo, useState } from 'react'
import { differenceInCalendarMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { it } from 'date-fns/locale'
import { TrendingUp, TrendingDown, Trophy, PiggyBank, Timer, Percent, Receipt, Sparkles, CalendarHeart, ChevronRight } from 'lucide-react'
import { useAccounts, useBalances, useCategories, useSnapshots, useTransactions } from '../lib/data'
import { avgMonthlyExpense, balanceAt, cashflow, inMonth, networth, spendByCategory } from '../lib/finance'
import { money, percent, percent1, round2 } from '../lib/format'
import { BackButton } from '../components/back'
import { Link } from '../components/nav'
import { Badge } from '../components/Icon'
import { NetworthPanel, ScrubChart } from '../components/NetworthCard'
import { Bars, Projection, StackedArea } from '../components/StatsCharts'
import { CountMoney, PageHeader, SkeletonPage } from '../components/ui'
import { GROUPS } from './Networth'
import { haptic } from '../lib/motion'

type Range = '1y' | '2y' | 'all'
const mLabel = (d: Date) => format(d, 'MMM yy', { locale: it })

export default function Stats() {
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances } = useBalances()
  const { data: txs = [] } = useTransactions()
  const { data: snaps = [] } = useSnapshots()
  const { data: categories = [] } = useCategories()
  const [range, setRange] = useState<Range>('all')
  const [scrub, setScrub] = useState<number | null>(null)
  const [catId, setCatId] = useState<string | null>(null)
  const [win, setWin] = useState<[number, number] | null>(null)

  // Patrimonio a fine di ogni mese, per conto: base di tutti i grafici
  const monthly = useMemo(() => {
    if (!accounts) return []
    const act = accounts.filter((a) => !a.archived && a.include_in_networth)
    const first = txs.length ? parseISO(txs[txs.length - 1].date) : subMonths(new Date(), 11)
    const n = Math.min(60, Math.max(2, differenceInCalendarMonths(new Date(), first) + 1))
    return Array.from({ length: n }, (_, i) => {
      const m = startOfMonth(subMonths(new Date(), n - 1 - i))
      const day = i === n - 1 ? format(new Date(), 'yyyy-MM-dd') : format(endOfMonth(m), 'yyyy-MM-dd')
      const parts = GROUPS.map((g) => round2(act.filter((a) => g.types.includes(a.type)).reduce((s, a) => s + balanceAt(a, day, txs, snaps), 0)))
      return { month: m, parts, value: round2(parts.reduce((s, v) => s + v, 0)) }
    })
  }, [accounts, txs, snaps])

  if (isLoading || !accounts) return <SkeletonPage hero />

  // Il periodo è la larghezza della finestra; col dito si scorre in tutta la storia
  const view = range === '1y' ? 12 : range === '2y' ? 24 : monthly.length
  const [ws, we] = win ?? [Math.max(0, monthly.length - view), monthly.length - 1]
  const atEnd = we >= monthly.length - 1
  const first = monthly[ws]?.value ?? 0
  const last = monthly[we]?.value ?? 0
  const sel = scrub !== null ? monthly[scrub] : monthly[we]
  const growth = last - first
  const months = Math.max(1, we - ws)
  const changes = monthly.slice(1).map((p, i) => ({ month: p.month, change: round2(p.value - monthly[i].value) }))
  const best = [...changes].sort((a, b) => b.change - a.change)[0]
  const worst = [...changes].sort((a, b) => a.change - b.change)[0]
  const nw = networth(accounts, balances)
  const avgExp = avgMonthlyExpense(txs, 3)
  const runway = avgExp > 0 ? nw.liquid / avgExp : 0

  // Flussi degli ultimi 12 mesi
  const flows = Array.from({ length: 12 }, (_, i) => {
    const m = startOfMonth(subMonths(new Date(), 11 - i))
    const f = cashflow(inMonth(txs, m))
    return { month: m, ...f, rate: f.income > 0 ? f.net / f.income : 0 }
  })
  const withIncome = flows.filter((f) => f.income > 0)
  const avgRate = withIncome.length ? withIncome.reduce((s, f) => s + f.rate, 0) / withIncome.length : 0
  const avgNet = flows.reduce((s, f) => s + f.net, 0) / flows.length

  // Categorie: le più pesanti degli ultimi 12 mesi
  const since = format(subMonths(new Date(), 12), 'yyyy-MM-dd')
  const catTotals = [...spendByCategory(txs.filter((t) => t.date >= since)).entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1])
  const curCat = catId ?? catTotals[0]?.[0] ?? null
  const catSeries = flows.map((f) => ({ label: format(f.month, 'MMM', { locale: it }), value: round2(spendByCategory(inMonth(txs, f.month)).get(curCat) ?? 0) }))

  // Proiezione a 10 anni con il risparmio medio attuale
  const yearly = Math.max(0, avgNet) * 12
  const proj = (r: number) => Array.from({ length: 11 }, (_, y) => {
    let v = nw.total
    for (let k = 0; k < y; k++) v = v * (1 + r) + yearly
    return round2(v)
  })

  // 730: spese detraibili dell'anno
  const year = String(new Date().getFullYear())
  const deductible = categories.filter((c) => c.deductible)
  const ded = deductible.map((c) => ({ c, total: round2(txs.filter((t) => t.category_id === c.id && t.kind === 'expense' && t.date.startsWith(year)).reduce((s, t) => s - t.amount, 0)) })).filter((x) => x.total > 0)
  const dedTotal = ded.reduce((s, x) => s + x.total, 0)

  return (
    <div>
      <BackButton label="Patrimonio" fallback="/patrimonio" />
      <PageHeader title="Statistiche" subtitle="Come sono andati i tuoi soldi nel tempo." />

      <NetworthPanel quiet className="pt-6 pb-4">
        <div className="px-6">
          <p className="text-sm opacity-75 first-letter:uppercase">{scrub !== null || !atEnd ? format(sel.month, 'MMMM yyyy', { locale: it }) : 'Patrimonio netto'}</p>
          <p className="mt-1.5 text-[clamp(2.2rem,10vw,3.4rem)] leading-none font-semibold tracking-[-0.04em]">
            {scrub !== null || !atEnd ? <span className="num">{money(sel.value)}</span> : <CountMoney value={last} />}
          </p>
          <p className="num mt-2.5 text-sm opacity-85">
            <span className={`mr-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${growth >= 0 ? 'bg-white/15' : 'bg-[#ffb4ab]/20 text-[#ffd5cf]'}`}>{growth >= 0 ? '▲' : '▼'} {money(Math.abs(growth), true)}</span>
            in {months} {months === 1 ? 'mese' : 'mesi'} · {growth >= 0 ? '+' : '−'}{money(Math.abs(growth / months), true)}/mese
          </p>
        </div>
        <ScrubChart key={range} data={monthly} view={view} onView={(a, b) => setWin([a, b])} height={170} onScrub={setScrub}
          label={(i) => format(monthly[i].month, 'MMM yyyy', { locale: it })} className="mt-5" />
        <div className="mx-auto mt-3 flex w-fit gap-1 rounded-full bg-black/15 p-1">
          {([['1y', '1 anno'], ['2y', '2 anni'], ['all', 'Tutto']] as const).map(([v, l]) => (
            <button key={v} onClick={() => { haptic('tick'); setWin(null); setScrub(null); setRange(v) }} className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${range === v ? 'bg-note-ink text-note' : 'opacity-75'}`}>{l}</button>
          ))}
        </div>
      </NetworthPanel>

      {/* Numeri chiave */}
      <section className="mt-5 grid grid-cols-2 gap-2.5">
        <Tile icon={<Trophy size={17} />} label="Mese migliore" value={best ? `+${money(best.change, true)}` : '—'} hint={best && format(best.month, 'MMMM yyyy', { locale: it })} tone="pos" />
        <Tile icon={<TrendingDown size={17} />} label="Mese peggiore" value={worst ? `${worst.change < 0 ? '−' : '+'}${money(Math.abs(worst.change), true)}` : '—'} hint={worst && format(worst.month, 'MMMM yyyy', { locale: it })} tone={worst && worst.change < 0 ? 'neg' : undefined} />
        <Tile icon={<Percent size={17} />} label="Tasso di risparmio" value={percent(avgRate)} hint="media degli ultimi 12 mesi" />
        <Tile icon={<PiggyBank size={17} />} label="Risparmio medio" value={money(avgNet, true)} hint="al mese, ultimi 12 mesi" tone={avgNet < 0 ? 'neg' : undefined} />
        <Tile icon={<Timer size={17} />} label="Autonomia" value={`${runway.toLocaleString('it-IT', { maximumFractionDigits: 1 })} mesi`} hint="vivresti con la liquidità attuale" />
        <Tile icon={<TrendingUp size={17} />} label="Crescita nel periodo" value={first ? percent1(growth / Math.abs(first)) : '—'} hint={`da ${money(first, true)}`} tone={growth >= 0 ? 'pos' : 'neg'} />
      </section>

      <Card title="Com'è cambiata la composizione" sub="Liquidità, risparmi e investimenti sopra lo zero, debiti sotto. Scorri col dito sul grafico.">
        <StackedArea data={monthly.slice(ws, we + 1).map((p) => ({ label: mLabel(p.month), parts: p.parts }))} labels={GROUPS.map((g) => g.title)} colors={['var(--brand)', 'var(--c-in)', 'var(--gold)', 'var(--neg)']} />
      </Card>

      <Card title="Variazione mese per mese" sub="Quanto è cresciuto (o sceso) il patrimonio ogni mese.">
        <Bars signed data={changes.slice(-12).map((c) => ({ label: format(c.month, 'MMM', { locale: it }), value: c.change }))} />
      </Card>

      <Card title="Tasso di risparmio" sub="Quota delle entrate che ti è rimasta, mese per mese. La linea è la media.">
        <Bars data={flows.map((f) => ({ label: format(f.month, 'MMM', { locale: it }), value: round2(Math.max(0, f.rate) * 100) }))} color="var(--c-in)" format={(v) => `${Math.round(v)}%`} />
      </Card>

      {catTotals.length > 0 && (
        <Card title="Una categoria nel tempo" sub="Scegli una categoria per vedere come cambia la spesa.">
          <div className="scrollbar-none -mx-5 mb-4 flex gap-2 overflow-x-auto px-5" data-no-swipe>
            {catTotals.slice(0, 10).map(([id]) => {
              const c = categories.find((x) => x.id === id)
              return (
                <button key={id} onClick={() => { haptic('tick'); setCatId(id) }} className={`press flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-medium ${curCat === id ? 'bg-ink text-paper' : 'bg-sunken'}`}>
                  <Badge icon={c?.icon ?? 'circle'} color={c?.color ?? '#94a3b8'} size={26} />{c?.name}
                </button>
              )
            })}
          </div>
          <Bars data={catSeries} color={categories.find((c) => c.id === curCat)?.color ?? 'var(--brand)'} />
        </Card>
      )}

      <Card title="Se continui così" sub={`Proiezione a 10 anni risparmiando ${money(Math.max(0, avgNet), true)} al mese (la tua media), con rendimenti diversi sui risparmi.`}>
        <Projection years={10} lines={[
          { label: 'Solo risparmio', color: 'var(--faint)', values: proj(0) },
          { label: 'Investito al 3% annuo', color: 'var(--c-in)', values: proj(0.03) },
          { label: 'Investito al 6% annuo', color: 'var(--brand)', values: proj(0.06) },
        ]} />
        <p className="mt-3 text-xs text-faint">Stima indicativa: i rendimenti non sono garantiti e non tiene conto di tasse e inflazione.</p>
      </Card>

      <Card title={`Spese detraibili ${year} (730)`} sub="Dalle categorie segnate come detraibili in Impostazioni › Categorie.">
        {deductible.length === 0 ? (
          <Link to="/impostazioni/categorie" className="flex items-center gap-3 rounded-2xl bg-sunken px-4 py-3 text-sm">
            <Receipt size={18} className="text-muted" /><span className="flex-1">Segna come detraibili le categorie come Salute o Università</span><ChevronRight size={16} className="text-faint" />
          </Link>
        ) : (
          <>
            <ul className="space-y-2.5">
              {ded.map(({ c, total }) => (
                <li key={c.id} className="flex items-center gap-3 text-sm"><Badge icon={c.icon} color={c.color} size={32} /><span className="flex-1">{c.name}</span><span className="num font-semibold">{money(total)}</span></li>
              ))}
              {!ded.length && <li className="text-sm text-muted">Nessuna spesa detraibile registrata quest'anno.</li>}
            </ul>
            {dedTotal > 0 && (
              <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-brand-soft px-4 py-3">
                <span className="text-sm">Recupero stimato (19%)</span>
                <span className="num text-lg font-semibold text-brand">{money(dedTotal * 0.19)}</span>
              </div>
            )}
            <p className="mt-2 text-xs text-faint">Per le spese sanitarie si applica una franchigia di 129,11 €. Conserva ricevute e pagamenti tracciabili.</p>
          </>
        )}
      </Card>

      <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Link to="/anno" className="press flex items-center gap-3.5 rounded-3xl bg-surface px-4 py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/15 text-gold"><CalendarHeart size={21} /></span>
          <span className="flex-1"><span className="block font-semibold">Il tuo anno</span><span className="block text-sm text-muted">Il riepilogo del {year}, una storia alla volta</span></span>
          <ChevronRight size={18} className="text-faint" />
        </Link>
        <Link to="/consulente" className="press flex items-center gap-3.5 rounded-3xl bg-surface px-4 py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Sparkles size={21} /></span>
          <span className="flex-1"><span className="block font-semibold">Consulente AI</span><span className="block text-sm text-muted">Cosa fare per far crescere questi numeri</span></span>
          <ChevronRight size={18} className="text-faint" />
        </Link>
      </div>
    </div>
  )
}

function Tile({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string | null; tone?: 'pos' | 'neg' }) {
  return (
    <div className="min-w-0 rounded-3xl bg-surface p-4">
      <p className="flex items-center gap-1.5 text-[0.8rem] text-muted">{icon}{label}</p>
      <p className={`num mt-1 truncate text-xl font-semibold tracking-[-0.01em] ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-faint first-letter:uppercase">{hint}</p>}
    </div>
  )
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub && <p className="mb-3 text-sm text-muted">{sub}</p>}
      <div className="rounded-3xl bg-surface p-5">{children}</div>
    </section>
  )
}
