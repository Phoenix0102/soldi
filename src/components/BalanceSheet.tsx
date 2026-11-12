import { useState } from 'react'
import { Sheet, useToast } from './ui'
import { Archive } from 'lucide-react'
import { useAccounts, useBalances, useInvalidate, useTransactions } from '../lib/data'
import { supabase } from '../lib/supabase'
import { parseAmount, todayISO, round2 } from '../lib/format'
import { ACCOUNT_TYPES } from '../lib/types'

/** Imposta il saldo attuale di uno o più conti (crea un "punto fisso" datato oggi). */
export function BalanceSheet({ open, onClose, onlyId }: { open: boolean; onClose: () => void; onlyId?: string }) {
  const { data: accounts = [] } = useAccounts()
  const { data: balances } = useBalances()
  const { data: txs = [] } = useTransactions()
  const invalidate = useInvalidate()
  const toast = useToast()
  const list = accounts.filter((a) => !a.archived && (!onlyId || a.id === onlyId))
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const unused = (id: string) => !balances?.get(id)?.snapshot_date && !txs.some((t) => t.account_id === id)
  const archive = async (id: string, name: string) => {
    const { error } = await supabase.from('accounts').update({ archived: true }).eq('id', id)
    if (error) return toast('Non riuscito', { tone: 'err' })
    invalidate('accounts')
    toast(`${name} archiviato`)
  }

  const save = async () => {
    const rows = list.flatMap((a) => {
      const raw = vals[a.id]
      if (raw === undefined || raw.trim() === '') return []
      const n = parseAmount(raw)
      if (n === null) return []
      return [{ account_id: a.id, date: todayISO(), balance: round2(a.type === 'debt' ? -Math.abs(n) : n) }]
    })
    if (!rows.length) return onClose()
    setBusy(true)
    const { error } = await supabase.from('balance_snapshots').insert(rows)
    setBusy(false)
    if (error) return toast(`Salvataggio non riuscito: ${error.message}`, { tone: 'err' })
    invalidate('balance_snapshots')
    toast(rows.length > 1 ? 'Saldi aggiornati' : 'Saldo aggiornato')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={onlyId ? 'Correggi saldo' : 'Saldi di oggi'}>
      <p className="mb-4 text-sm text-muted">
        Scrivi quanto c'è adesso su ogni conto, come lo vedi nell'app della banca. Da qui in poi il saldo si aggiorna con i movimenti che registri. I conti che non usi puoi archiviarli con <Archive size={13} className="inline" />.
      </p>
      <div className="space-y-3">
        {list.map((a) => {
          const b = balances?.get(a.id)
          return (
            <label key={a.id} className="flex items-center gap-3">
              <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block text-xs text-muted">{a.type === 'debt' ? 'Quanto devi ancora' : a.type === 'investment' ? 'Valore attuale del portafoglio' : ACCOUNT_TYPES[a.type].label}</span>
              </span>
              {!onlyId && unused(a.id) && (
                <button type="button" onClick={() => archive(a.id, a.name)} className="rounded-full p-2 text-faint hover:bg-sunken hover:text-ink" aria-label={`Archivia ${a.name}`}><Archive size={17} /></button>
              )}
              <input inputMode="decimal" className="field num !w-32 text-right"
                placeholder={b?.snapshot_date ? String(Math.abs(b.balance)).replace('.', ',') : '0,00'}
                value={vals[a.id] ?? ''} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value })} />
            </label>
          )
        })}
      </div>
      <button onClick={save} disabled={busy} className="btn btn-primary mt-6 w-full py-3.5">{busy ? 'Salvo…' : 'Salva saldi'}</button>
    </Sheet>
  )
}
