/* Modulo per una spesa o entrata fissa (abbonamento, rata, stipendio) e la registrazione dell'addebito. */
import { useState } from 'react'
import { useAccounts, useCategories, useTable, useInvalidate } from '../lib/data'
import { advance } from '../lib/finance'
import { parseAmount, round2, shortDate, todayISO } from '../lib/format'
import { FREQUENCIES, type Frequency, type Recurring } from '../lib/types'
import { supabase } from '../lib/supabase'
import { Label, Segmented, Sheet, useToast } from './ui'

/** Registra l'addebito di una ricorrente come movimento e passa alla scadenza successiva. */
export function useRecordRecurring() {
  const { data: accounts = [] } = useAccounts()
  const invalidate = useInvalidate()
  const toast = useToast()
  return async (r: Recurring) => {
    const { error } = await supabase.from('transactions').insert({
      account_id: r.account_id ?? accounts.find((a) => !a.archived)?.id, date: r.next_date <= todayISO() ? r.next_date : todayISO(),
      amount: r.kind === 'expense' ? -r.amount : r.amount, kind: r.kind, description: r.name, category_id: r.category_id, recurring_id: r.id,
    })
    if (error) return toast(`Non riuscito: ${error.message}`, { tone: 'err' })
    await supabase.from('recurring').update({ next_date: advance(r.next_date, r.frequency) }).eq('id', r.id)
    invalidate('transactions', 'recurring')
    toast(`${r.name} registrato, prossimo il ${shortDate(advance(r.next_date, r.frequency))}`)
  }
}

export function RecurringForm({ item, onClose }: { item?: Recurring; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { insert, update, remove } = useTable<Recurring & Record<string, unknown>>('recurring')
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item ? String(item.amount).replace('.', ',') : '')
  const [kind, setKind] = useState<'expense' | 'income'>(item?.kind ?? 'expense')
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? 'monthly')
  const [nextDate, setNextDate] = useState(item?.next_date ?? todayISO())
  const [accountId, setAccountId] = useState(item?.account_id ?? accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '')
  const [active, setActive] = useState(item?.active ?? true)
  const save = async () => {
    const a = parseAmount(amount)
    if (!name.trim() || !a) return
    const row = { name: name.trim(), amount: round2(Math.abs(a)), kind, frequency, next_date: nextDate, account_id: accountId || null, category_id: categoryId || null, active, match_text: item?.match_text ?? name.trim().toLowerCase() }
    if (item) await update.mutateAsync({ id: item.id, ...row }); else await insert.mutateAsync(row)
    toast(item ? 'Salvato' : `${name.trim()} aggiunto`); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={item ? item.name : 'Nuova spesa fissa'}>
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Uscita' }, { value: 'income', label: 'Entrata' }]} />
        <label className="block"><Label>Nome</Label><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Spotify" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><Label>Importo</Label><input className="field num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
          <label className="block"><Label>Frequenza</Label>
            <select className="field" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><Label>Prossima scadenza</Label><input type="date" className="field" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><Label>Conto</Label>
            <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block"><Label>Categoria</Label>
            <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Nessuna</option>
              {categories.filter((c) => c.kind === kind && !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        {item && (
          <label className="flex items-center justify-between rounded-2xl bg-sunken p-4">
            <span><span className="block font-medium">Attivo</span><span className="block text-sm text-muted">Spegnilo se l'hai disdetto</span></span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />
          </label>
        )}
        <div className="flex gap-3 pt-2">
          {item && <button className="btn btn-danger" onClick={async () => { await remove.mutateAsync(item.id); toast('Eliminato'); onClose() }}>Elimina</button>}
          <button className="btn btn-primary flex-1 py-3.5" onClick={save}>{item ? 'Salva' : 'Aggiungi'}</button>
        </div>
      </div>
    </Sheet>
  )
}
