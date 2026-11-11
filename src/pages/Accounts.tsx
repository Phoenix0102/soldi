import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronRight } from 'lucide-react'
import { useAccounts, useBalances } from '../lib/data'
import { networth } from '../lib/finance'
import { ACCOUNT_TYPES, type AccountType } from '../lib/types'
import { money, shortDate } from '../lib/format'
import { Money, PageHeader, Spinner } from '../components/ui'
import { AccountForm } from '../components/AccountForm'
import { BalanceSheet } from '../components/BalanceSheet'

const GROUPS: { title: string; types: AccountType[] }[] = [
  { title: 'Liquidità', types: ['checking', 'card', 'wallet', 'cash'] },
  { title: 'Risparmi', types: ['savings'] },
  { title: 'Investimenti', types: ['investment'] },
  { title: 'Debiti', types: ['debt'] },
]

export default function Accounts() {
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances } = useBalances()
  const [adding, setAdding] = useState(false)
  const [bal, setBal] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  if (isLoading || !accounts) return <Spinner />
  const nw = networth(accounts, balances)
  const visible = accounts.filter((a) => showArchived || !a.archived)

  return (
    <div>
      <PageHeader title="Conti" subtitle={`Patrimonio netto ${money(nw.total)}`} right={
        <div className="flex gap-2">
          <button onClick={() => setBal(true)} className="btn btn-ghost hidden sm:inline-flex">Aggiorna saldi</button>
          <button onClick={() => setAdding(true)} className="btn btn-primary"><Plus size={18} /> Conto</button>
        </div>
      } />
      <button onClick={() => setBal(true)} className="btn btn-ghost mb-6 w-full sm:hidden">Aggiorna saldi</button>

      <div className="space-y-8">
        {GROUPS.map((g) => {
          const list = visible.filter((a) => g.types.includes(a.type))
          if (!list.length) return null
          const total = list.filter((a) => !a.archived).reduce((s, a) => s + (balances?.get(a.id)?.balance ?? 0), 0)
          return (
            <section key={g.title}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-semibold">{g.title}</h2>
                <Money value={total} className="text-muted" />
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
                {list.map((a) => {
                  const b = balances?.get(a.id)
                  return (
                    <li key={a.id}>
                      <Link to={`/conti/${a.id}`} className={`flex items-center gap-4 px-5 py-4 hover:bg-sunken ${a.archived ? 'opacity-50' : ''}`}>
                        <span className="h-10 w-10 shrink-0 rounded-full" style={{ background: a.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{a.name}</span>
                          <span className="block text-sm text-muted">
                            {a.archived ? 'Archiviato' : b?.snapshot_date ? `Saldo verificato il ${shortDate(b.snapshot_date)}` : ACCOUNT_TYPES[a.type].label}
                          </span>
                        </span>
                        <Money value={b?.balance ?? 0} className="text-lg font-semibold" />
                        <ChevronRight size={18} className="text-faint" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      {accounts.some((a) => a.archived) && (
        <button onClick={() => setShowArchived(!showArchived)} className="mt-6 text-sm text-muted underline underline-offset-4">
          {showArchived ? 'Nascondi archiviati' : 'Mostra archiviati'}
        </button>
      )}
      {adding && <AccountForm open onClose={() => setAdding(false)} />}
      <BalanceSheet open={bal} onClose={() => setBal(false)} />
    </div>
  )
}
