import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGo } from '../components/nav'
import { Pencil, Archive, Trash2, Scale, ArchiveRestore } from 'lucide-react'
import { endOfMonth, format, subMonths } from 'date-fns'
import { BackButton } from '../components/back'
import { ScrubChart } from '../components/NetworthCard'
import { haptic } from '../lib/motion'
import { useAccounts, useBalances, useCategories, useSnapshots, useTable, useTransactions } from '../lib/data'
import { balanceAt } from '../lib/finance'
import { money, monthLabel, longDate } from '../lib/format'
import { ACCOUNT_TYPES, type Account } from '../lib/types'
import { TxRow } from '../components/TxRow'
import { AccountForm } from '../components/AccountForm'
import { Portfolio } from '../components/Portfolio'
import { BalanceSheet } from '../components/BalanceSheet'
import { Confirm, Empty, Money, SkeletonPage, useToast } from '../components/ui'

export default function AccountDetail() {
  const { id } = useParams()
  const nav = useGo()
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
  const [askDelete, setAskDelete] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)

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

  if (!accounts) return <SkeletonPage />
  if (!acc) return <Empty title="Conto non trovato" action={<button onClick={() => nav('/patrimonio')} className="btn btn-ghost">Torna al patrimonio</button>} />

  const b = balances?.get(acc.id)
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const accSnaps = snaps.filter((s) => s.account_id === acc.id).slice(-5).reverse()

  return (
    <div>
      <BackButton label="Patrimonio" fallback="/patrimonio" always />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] text-xl font-semibold text-white" style={{ background: acc.color }}>{acc.name.slice(0, 1).toUpperCase()}</span>
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

      <p className="num mt-6 text-5xl font-semibold tracking-[-0.03em]">{money(scrub !== null ? series[scrub].value : b?.balance ?? 0)}</p>
      <p className="mt-1 text-sm text-muted first-letter:uppercase">
        {scrub !== null ? `Fine ${monthLabel(series[scrub].month)}` : b?.snapshot_date ? `Ultimo saldo verificato il ${longDate(b.snapshot_date)}` : 'Saldo non ancora impostato'}
      </p>

      <div className="mt-5 rounded-3xl bg-surface pt-4 pb-2" style={{ color: acc.color }}>
        <ScrubChart data={series} height={130} className="mx-4" onScrub={(i) => { if (i !== null && i !== scrub) haptic('tick'); setScrub(i) }} />
        <p className="mt-1 px-4 text-xs text-faint">Ultimi 12 mesi · tieni premuto e scorri per vedere i valori</p>
      </div>

      {accSnaps.length > 0 && (
        <details className="mt-4 rounded-2xl bg-surface px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium">Saldi verificati</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {accSnaps.map((s) => <li key={s.id} className="flex justify-between"><span className="text-muted">{longDate(s.date)}</span><Money value={s.balance} /></li>)}
          </ul>
        </details>
      )}

      {acc.type === 'investment' && <Portfolio accountId={acc.id} />}

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
        <button className="btn btn-danger" onClick={() => setAskDelete(true)}><Trash2 size={17} /> Elimina</button>
      </div>

      <Confirm open={askDelete} onClose={() => setAskDelete(false)} danger confirmLabel="Elimina conto"
        title={`Eliminare ${acc.name}?`}
        text={own.length ? `Verranno eliminati anche i suoi ${own.length} movimenti. Non si può annullare: se vuoi solo nasconderlo, usa Archivia.` : 'Il conto non ha movimenti. Non si può annullare.'}
        onConfirm={async () => { await remove.mutateAsync(acc.id); setAskDelete(false); toast('Conto eliminato'); nav('/patrimonio') }} />
      {edit && <AccountForm open account={acc} onClose={() => setEdit(false)} />}
      {bal && <BalanceSheet open onlyId={acc.id} onClose={() => setBal(false)} />}
    </div>
  )
}
