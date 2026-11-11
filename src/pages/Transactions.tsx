import { useMemo, useState } from 'react'
import { addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Search, Upload } from 'lucide-react'
import { Link } from '../components/nav'
import { useAccounts, useCategories, useTransactions } from '../lib/data'
import { cashflow, monthKey } from '../lib/finance'
import { dayLabel, money, monthLabel } from '../lib/format'
import { TxRow } from '../components/TxRow'
import { Empty, PageHeader, SkeletonPage } from '../components/ui'
import { useQuickAdd } from '../components/QuickAdd'

export default function Transactions() {
  const { data: txs, isLoading } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const qa = useQuickAdd()
  const [month, setMonth] = useState<Date | null>(new Date())
  const [q, setQ] = useState('')
  const [acc, setAcc] = useState('')
  const [cat, setCat] = useState('')
  const [kind, setKind] = useState('')

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (txs ?? []).filter((t) => {
      if (month && !t.date.startsWith(monthKey(month))) return false
      if (acc && t.account_id !== acc) return false
      if (cat === 'none' ? t.category_id || t.kind === 'transfer' : cat && t.category_id !== cat) return false
      if (kind && t.kind !== kind) return false
      if (needle) {
        const hay = `${t.description} ${t.notes ?? ''} ${catMap.get(t.category_id ?? '')?.name ?? ''} ${Math.abs(t.amount).toFixed(2).replace('.', ',')}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [txs, month, acc, cat, kind, q, catMap])

  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>()
    for (const t of filtered) { const g = m.get(t.date) ?? []; g.push(t); m.set(t.date, g) }
    return [...m.entries()]
  }, [filtered])

  const totals = cashflow(filtered)
  const uncategorized = (txs ?? []).filter((t) => !t.category_id && t.kind !== 'transfer').length

  if (isLoading) return <SkeletonPage />

  return (
    <div>
      <PageHeader title="Movimenti" right={
        <Link to="/importa" className="btn btn-ghost"><Upload size={17} /> <span className="hidden sm:inline">Importa estratto conto</span><span className="sm:hidden">Importa</span></Link>
      } />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-full items-center justify-between rounded-full bg-surface sm:w-auto">
          <button className="rounded-full p-2.5 hover:bg-sunken disabled:opacity-30" disabled={!month} onClick={() => month && setMonth(subMonths(month, 1))} aria-label="Mese precedente"><ChevronLeft size={18} /></button>
          <button onClick={() => setMonth(month ? null : new Date())} className="min-w-36 px-1 text-center font-medium capitalize">{month ? monthLabel(month) : 'Tutti i mesi'}</button>
          <button className="rounded-full p-2.5 hover:bg-sunken disabled:opacity-30" disabled={!month || monthKey(month) >= monthKey(new Date())} onClick={() => month && setMonth(addMonths(month, 1))} aria-label="Mese successivo"><ChevronRight size={18} /></button>
        </div>
        <label className="relative min-w-0 flex-1 basis-60">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, nota o importo" className="field !rounded-full !bg-surface !pl-10" />
        </label>
      </div>

      <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
        <Select value={kind} onChange={setKind} options={[['', 'Tutti i tipi'], ['expense', 'Uscite'], ['income', 'Entrate'], ['transfer', 'Giroconti']]} />
        <Select value={acc} onChange={setAcc} options={[['', 'Tutti i conti'], ...accounts.map((a) => [a.id, a.name] as [string, string])]} />
        <Select value={cat} onChange={setCat} options={[['', 'Tutte le categorie'], ['none', `Da categorizzare (${uncategorized})`], ...categories.filter((c) => !c.archived).map((c) => [c.id, c.name] as [string, string])]} />
      </div>

      <div className="mt-5 flex gap-6 text-sm">
        <span><span className="text-muted">Entrate </span><span className="num font-semibold text-pos">{money(totals.income)}</span></span>
        <span><span className="text-muted">Uscite </span><span className="num font-semibold">{money(totals.expense)}</span></span>
        <span><span className="text-muted">Saldo </span><span className="num font-semibold">{money(totals.net)}</span></span>
      </div>

      <div className="mt-4" key={`${month ? monthKey(month) : 'all'}|${acc}|${cat}|${kind}`}>
        {groups.length === 0 ? (
          <Empty title="Nessun movimento qui" text={q || acc || cat || kind ? 'Prova a togliere qualche filtro.' : 'Aggiungi un movimento o importa l\'estratto conto della banca.'}
            action={<button onClick={() => qa.open()} className="btn btn-primary">Nuovo movimento</button>} />
        ) : groups.map(([date, list], gi) => {
          const day = list.reduce((s, t) => s + (t.kind === 'transfer' ? 0 : t.amount), 0)
          return (
            <section key={date} className="rise mb-4" style={{ '--i': gi } as React.CSSProperties}>
              <div className="flex items-baseline justify-between px-2 py-1.5 text-sm">
                <h3 className="font-medium text-muted capitalize">{dayLabel(date)}</h3>
                <span className="num text-faint">{day > 0 ? '+' : ''}{money(day)}</span>
              </div>
              <div>{list.map((t) => <TxRow key={t.id} t={t} cat={catMap.get(t.category_id ?? '')} acc={accMap.get(t.account_id)} />)}</div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`shrink-0 cursor-pointer appearance-none rounded-full px-4 py-2 text-sm font-medium outline-none ${value ? 'bg-ink text-paper' : 'bg-surface text-ink'}`}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}
