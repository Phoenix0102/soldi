import { useMemo, useState } from 'react'
import { Plus, ChevronRight, Scale, AlertCircle, BarChart3, Sparkles } from 'lucide-react'
import { Link } from '../components/nav'
import { useAccounts, useBalances, useSnapshots, useTransactions } from '../lib/data'
import { monthlyChanges, networth, networthFull, type Period } from '../lib/finance'
import { ACCOUNT_TYPES, type AccountType } from '../lib/types'
import { money, monthLabel, monthShort, percent1 } from '../lib/format'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CountMoney, Money, PageHeader, SkeletonPage } from '../components/ui'
import { NetworthPanel, ScrubChart } from '../components/NetworthCard'
import { AccountForm } from '../components/AccountForm'
import { BalanceSheet } from '../components/BalanceSheet'
import { haptic } from '../lib/motion'

export const GROUPS: { key: string; title: string; types: AccountType[]; color: string }[] = [
  { key: 'liquid', title: 'Liquidità', types: ['checking', 'card', 'wallet', 'cash'], color: 'var(--brand)' },
  { key: 'savings', title: 'Risparmi', types: ['savings'], color: 'var(--c-in)' },
  { key: 'invest', title: 'Investimenti', types: ['investment'], color: 'var(--gold)' },
  { key: 'debt', title: 'Debiti', types: ['debt'], color: 'var(--neg)' },
]

const PERIODS: { value: Period; label: string; since: string }[] = [
  { value: '3m', label: '3M', since: 'negli ultimi 3 mesi' },
  { value: '6m', label: '6M', since: 'negli ultimi 6 mesi' },
  { value: '1y', label: '1A', since: "nell'ultimo anno" },
  { value: 'all', label: 'Tutto', since: "dall'inizio" },
]

export default function Networth() {
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances } = useBalances()
  const { data: txs = [] } = useTransactions()
  const { data: snaps = [] } = useSnapshots()
  const [period, setPeriod] = useState<Period>('6m')
  const [scrub, setScrub] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [bal, setBal] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  // Tutta la storia; il periodo decide quanta se ne vede insieme, col dito si va indietro
  const weekly = period === '3m'
  const series = useMemo(() => networthFull(accounts ?? [], txs, snaps, weekly), [accounts, txs, snaps, weekly])
  const view = period === '3m' ? 14 : period === '6m' ? 7 : period === '1y' ? 13 : series.length
  const [win, setWin] = useState<[number, number] | null>(null)
  const changes = useMemo(() => monthlyChanges(accounts ?? [], txs, snaps, 6), [accounts, txs, snaps])

  if (isLoading || !accounts) return <SkeletonPage hero />

  const nw = networth(accounts, balances)
  const active = accounts.filter((a) => !a.archived)
  const bal0 = (id: string) => balances?.get(id)?.balance ?? 0
  const empty = active.filter((a) => !balances?.get(a.id)?.snapshot_date && !txs.some((t) => t.account_id === a.id))

  const [vs, ve] = win ?? [Math.max(0, series.length - view), series.length - 1]
  const atEnd = ve >= series.length - 1
  const first = series[vs]?.value ?? 0
  const shown = scrub !== null ? series[scrub] : series[ve]
  const diff = (shown?.value ?? nw.total) - first
  const pctChange = first !== 0 ? diff / Math.abs(first) : 0
  const per = PERIODS.find((p) => p.value === period)!

  // Composizione: attività positive per gruppo, debiti a parte
  const groups = GROUPS.map((g) => {
    const list = active.filter((a) => g.types.includes(a.type) && a.include_in_networth)
    return { ...g, total: list.reduce((s, a) => s + bal0(a.id), 0) }
  })
  const assets = groups.filter((g) => g.key !== 'debt' && g.total > 0)
  const assetsTotal = assets.reduce((s, g) => s + g.total, 0)
  const maxChange = Math.max(1, ...changes.map((c) => Math.abs(c.change)))
  const visible = accounts.filter((a) => showArchived || !a.archived)

  return (
    <div>
      <PageHeader title="Patrimonio" right={
        <button onClick={() => setAdding(true)} className="btn btn-ghost !px-3" aria-label="Nuovo conto"><Plus size={20} /></button>
      } />

      <NetworthPanel quiet className="pt-6 pb-4">
        <div className="px-6">
          <p className="text-sm opacity-75 first-letter:uppercase">{scrub !== null ? dateLabel(shown.date, period) : atEnd ? 'Patrimonio netto' : `Patrimonio a ${dateLabel(shown.date, 'all').toLowerCase()}`}</p>
          <p className="mt-1.5 text-[clamp(2.3rem,11vw,3.6rem)] leading-none font-semibold tracking-[-0.04em]">
            {scrub !== null || !atEnd ? <span className="num">{money(shown.value)}</span> : <CountMoney value={nw.total} />}
          </p>
          <p className="num mt-2.5 text-sm opacity-85">
            <span className={`mr-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${diff >= 0 ? 'bg-white/15' : 'bg-[#ffb4ab]/20 text-[#ffd5cf]'}`}>
              {diff >= 0 ? '▲' : '▼'} {money(Math.abs(diff), true)}{first !== 0 && ` · ${percent1(Math.abs(pctChange))}`}
            </span>
            {scrub !== null ? 'rispetto all\'inizio della finestra' : atEnd ? per.since : `da ${dateLabel(series[vs].date, 'all').toLowerCase()}`}
          </p>
        </div>
        <ScrubChart key={period} data={series} view={view} onView={(a, b) => setWin([a, b])}
          onScrub={(i) => { if (i !== null && i !== scrub) haptic('tick'); setScrub(i) }} className="mt-5" />
        {view < series.length && <p className="mt-1.5 text-center text-[0.7rem] opacity-60">Scorri il grafico o la barra per tornare indietro nel tempo</p>}
        <div className="mx-auto mt-3 flex w-fit gap-1 rounded-full bg-black/15 p-1" role="tablist" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button key={p.value} role="tab" aria-selected={period === p.value} onClick={() => { haptic('tick'); setWin(null); setPeriod(p.value) }}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${period === p.value ? 'bg-note-ink text-note' : 'opacity-75'}`}>{p.label}</button>
          ))}
        </div>
      </NetworthPanel>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Link to="/statistiche" className="press flex items-center gap-2.5 rounded-2xl bg-surface px-3.5 py-3 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand"><BarChart3 size={17} /></span> Statistiche
        </Link>
        <Link to="/consulente" className="press flex items-center gap-2.5 rounded-2xl bg-surface px-3.5 py-3 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-brand-ink"><Sparkles size={17} /></span> Consulente AI
        </Link>
      </div>

      {empty.length > 0 && (
        <button onClick={() => setBal(true)} className="press mt-4 flex w-full items-center gap-3 rounded-3xl border border-gold/40 bg-gold/10 p-4 text-left">
          <AlertCircle size={20} className="shrink-0 text-gold" />
          <span className="flex-1 text-sm"><strong className="font-semibold">{empty.length === 1 ? `${empty[0].name} non ha un saldo` : `${empty.length} conti senza saldo`}</strong><br /><span className="text-muted">Imposta quanto c'è oggi, oppure archivia quelli che non usi.</span></span>
          <ChevronRight size={18} className="text-faint" />
        </button>
      )}

      {/* Composizione */}
      {assetsTotal > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Com'è fatto</h2>
          <div className="rounded-3xl bg-surface p-5">
            <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full">
              {assets.map((g) => <span key={g.key} className="bar-fill h-full rounded-full" style={{ width: `${(g.total / assetsTotal) * 100}%`, background: g.color }} />)}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {groups.filter((g) => g.total !== 0).map((g) => (
                <li key={g.key} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="min-w-0">
                    <span className="block text-sm text-muted">{g.title}</span>
                    <span className="num block font-semibold">{money(g.total, true)}</span>
                    {g.key !== 'debt' && <span className="block text-xs text-faint">{percent1(g.total / assetsTotal)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Mese per mese */}
      {changes.some((c) => c.change !== 0) && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Mese per mese</h2>
          <div className="rounded-3xl bg-surface p-5">
            <ul className="space-y-2.5">
              {[...changes].reverse().map((c) => (
                <li key={c.month.toISOString()} className="grid grid-cols-[3.2rem_1fr_6.5rem] items-center gap-3 text-sm">
                  <span className="text-muted capitalize">{monthShort(c.month)}</span>
                  <span className="relative h-2 rounded-full bg-sunken">
                    <span className="bar-fill absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.abs(c.change) / maxChange) * 100}%`, background: c.change >= 0 ? 'var(--pos)' : 'var(--neg)' }} />
                  </span>
                  <span className={`num text-right font-semibold ${c.change >= 0 ? 'text-pos' : 'text-neg'}`}>{c.change >= 0 ? '+' : '−'}{money(Math.abs(c.change), true)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Conti */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Conti</h2>
          <button onClick={() => setBal(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"><Scale size={15} /> Aggiorna saldi</button>
        </div>
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const list = visible.filter((a) => g.types.includes(a.type))
            if (!list.length) return null
            return (
              <div key={g.key}>
                <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase">{g.title}</p>
                <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
                  {list.map((a) => {
                    const b = balances?.get(a.id)
                    const missing = !b?.snapshot_date && !txs.some((t) => t.account_id === a.id)
                    return (
                      <li key={a.id}>
                        <Link to={`/conti/${a.id}`} className={`press flex items-center gap-3 px-4 py-3.5 ${a.archived ? 'opacity-50' : ''}`}>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-white" style={{ background: a.color }}>{a.name.slice(0, 1).toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{a.name}</span>
                            <span className={`block truncate text-sm ${missing ? 'text-gold' : 'text-muted'}`}>
                              {a.archived ? 'Archiviato' : missing ? 'Saldo da impostare' : a.institution || ACCOUNT_TYPES[a.type].label}
                            </span>
                          </span>
                          <Money value={b?.balance ?? 0} className="shrink-0 font-semibold" />
                          <ChevronRight size={18} className="shrink-0 text-faint" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        {accounts.some((a) => a.archived) && (
          <button onClick={() => setShowArchived(!showArchived)} className="mt-4 text-sm text-muted underline underline-offset-4">
            {showArchived ? 'Nascondi archiviati' : 'Mostra archiviati'}
          </button>
        )}
      </section>

      {adding && <AccountForm open onClose={() => setAdding(false)} />}
      <BalanceSheet open={bal} onClose={() => setBal(false)} />
    </div>
  )
}

function dateLabel(d: Date, period: Period) {
  return period === '3m' ? `Settimana del ${format(d, 'd MMMM', { locale: it })}` : monthLabel(d)
}
