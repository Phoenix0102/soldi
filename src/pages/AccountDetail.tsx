import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Archive, Trash2, Scale, ArchiveRestore } from 'lucide-react'
import { endOfMonth, format, subMonths } from 'date-fns'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAccounts, useBalances, useCategories, useSnapshots, useTable, useTransactions } from '../lib/data'
import { balanceAt } from '../lib/finance'
import { money, monthShort, monthLabel, longDate } from '../lib/format'
import { ACCOUNT_TYPES, type Account } from '../lib/types'
import { TxRow } from '../components/TxRow'
import { AccountForm } from '../components/AccountForm'
import { BalanceSheet } from '../components/BalanceSheet'
import { Empty, Money, Spinner, useToast } from '../components/ui'

export default function AccountDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { data: accounts } = useAccounts()
  const { data: balances } = useBalances()
  const { data: txs = [] } = useTransactions()
  const { data: snaps = [] } = useSnapshots()
  const { data: categories = [] } = useCategories()
  const { update, remove } = useTable<Account & Record<string, unknown>>('accounts')
  const [edit, setEdit] = useState(false)
  const [bal, setBal] = useState(false)
  const [limit, setLimit] = useState(30)

  const acc = accounts?.find((a) => a.id === id)
  const own = useMemo(() => txs.filter((t) => t.account_id === id), [txs, id])
  const series = useMemo(() => {
    if (!acc) return []
    return Array.from({ length: 12 }, (_, i) => {
      const m = subMonths(new Date(), 11 - i)
      const day = i === 11 ? format(new Date(), 'yyyy-MM-dd') : format(endOfMonth(m), 'yyyy-MM-dd')
      return { month: m, value: balanceAt(acc, day, txs, snaps) }
    })
  }, [acc, txs, snaps])

  if (!accounts) return <Spinner />
  if (!acc) return <Empty title="Conto non trovato" action={<Link to="/conti" className="btn btn-ghost">Torna ai conti</Link>} />

  const b = balances?.get(acc.id)
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const accSnaps = snaps.filter((s) => s.account_id === acc.id).slice(-5).reverse()

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} /> Indietro</button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="h-14 w-14 rounded-full" style={{ background: acc.color }} />
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{acc.name}</h1>
            <p className="text-muted">{[acc.institution, ACCOUNT_TYPES[acc.type].label].filter(Boolean).join(', ')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setBal(true)} className="btn btn-ghost"><Scale size={17} /> {acc.type === 'investment' ? 'Aggiorna valore' : 'Correggi saldo'}</button>
          <button onClick={() => setEdit(true)} className="btn btn-ghost !px-3" aria-label="Modifica"><Pencil size={17} /></button>
        </div>
      </header>

      <p className="num mt-6 text-5xl font-semibold tracking-[-0.03em]">{money(b?.balance ?? 0)}</p>
      <p className="mt-1 text-sm text-muted">{b?.snapshot_date ? `Ultimo saldo verificato il ${longDate(b.snapshot_date)}` : 'Saldo non ancora impostato'}</p>

      <div className="mt-6 h-44 rounded-3xl bg-surface p-3" role="img" aria-label="Saldo negli ultimi 12 mesi">
        <ResponsiveContainer>
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="month" tickFormatter={(d: Date) => monthShort(d)} tickLine={false} axisLine={false} tick={{ fill: 'var(--faint)', fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
              <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
                <div className="num font-semibold">{money(payload[0].value as number)}</div>
                <div className="text-xs text-muted capitalize">{monthLabel((payload[0].payload as { month: Date }).month)}</div>
              </div>) : null} />
            <Area type="monotone" dataKey="value" stroke={acc.color} strokeWidth={2} fill={acc.color} fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {accSnaps.length > 0 && (
        <details className="mt-4 rounded-2xl bg-surface px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium">Saldi verificati</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {accSnaps.map((s) => <li key={s.id} className="flex justify-between"><span className="text-muted">{longDate(s.date)}</span><Money value={s.balance} /></li>)}
          </ul>
        </details>
      )}

      <h2 className="mt-8 mb-2 text-lg font-semibold">Movimenti</h2>
      {own.length === 0 ? <Empty title="Nessun movimento su questo conto" /> : (
        <>
          {own.slice(0, limit).map((t) => <TxRow key={t.id} t={t} cat={catMap.get(t.category_id ?? '')} showAccount={false} />)}
          {own.length > limit && <button onClick={() => setLimit(limit + 50)} className="btn btn-ghost mt-3 w-full">Mostra altri</button>}
        </>
      )}

      <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-6">
        <button className="btn btn-ghost" onClick={async () => { await update.mutateAsync({ id: acc.id, archived: !acc.archived }); toast(acc.archived ? 'Conto ripristinato' : 'Conto archiviato') }}>
          {acc.archived ? <><ArchiveRestore size={17} /> Ripristina</> : <><Archive size={17} /> Archivia</>}
        </button>
        <button className="btn btn-danger" onClick={async () => {
          if (!confirm(`Eliminare "${acc.name}" e tutti i suoi ${own.length} movimenti? Non si può annullare.`)) return
          await remove.mutateAsync(acc.id); toast('Conto eliminato'); nav('/conti')
        }}><Trash2 size={17} /> Elimina</button>
      </div>

      {edit && <AccountForm open account={acc} onClose={() => setEdit(false)} />}
      {bal && <BalanceSheet open onlyId={acc.id} onClose={() => setBal(false)} />}
    </div>
  )
}
