import { useState } from 'react'
import { Sheet, Label, useToast } from './ui'
import { COLORS } from './Icon'
import { useTable } from '../lib/data'
import { supabase } from '../lib/supabase'
import { parseAmount, todayISO, round2 } from '../lib/format'
import { ACCOUNT_TYPES, type Account, type AccountType } from '../lib/types'

export function AccountForm({ open, onClose, account }: { open: boolean; onClose: () => void; account?: Account }) {
  const { insert, update } = useTable<Account & Record<string, unknown>>('accounts')
  const toast = useToast()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [color, setColor] = useState(account?.color ?? COLORS[6])
  const [include, setInclude] = useState(account?.include_in_networth ?? true)
  const [wallet, setWallet] = useState(account?.wallet_match ?? '')
  const [balance, setBalance] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const row = { name: name.trim(), type, institution: institution.trim() || null, color, include_in_networth: include, wallet_match: wallet.trim() || null }
      if (account) {
        await update.mutateAsync({ id: account.id, ...row })
        toast('Conto aggiornato')
      } else {
        const [created] = await insert.mutateAsync({ ...row, sort: 99 })
        const n = parseAmount(balance)
        if (n !== null && created) {
          await supabase.from('balance_snapshots').insert({ account_id: created.id, date: todayISO(), balance: round2(type === 'debt' ? -Math.abs(n) : n) })
        }
        toast('Conto creato')
      }
      onClose()
    } catch (e) {
      toast(`Salvataggio non riuscito: ${(e as Error).message}`, { tone: 'err' })
    } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={account ? 'Modifica conto' : 'Nuovo conto'}>
      <div className="space-y-4">
        <label className="block"><Label>Nome</Label><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Conto Revolut" /></label>
        <label className="block">
          <Label>Tipo</Label>
          <select className="field" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="block"><Label>Banca o servizio</Label><input className="field" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Es. ING" /></label>
        {!account && (
          <label className="block">
            <Label>{type === 'debt' ? 'Quanto devi oggi' : 'Saldo di oggi'}</Label>
            <input className="field num" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
          </label>
        )}
        {['checking', 'card', 'wallet', 'savings'].includes(type) && (
          <label className="block">
            <Label>Nome della carta nel Wallet (Apple Pay)</Label>
            <input className="field" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Es. Revolut, ING Visa" />
            <span className="mt-1 block text-xs text-muted">I pagamenti con una carta che contiene questo nome finiscono su questo conto. Più nomi separati da virgola.</span>
          </label>
        )}
        <div>
          <Label>Colore</Label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Colore ${c}`}
                className={`h-8 w-8 rounded-full transition ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-4 rounded-2xl bg-sunken p-4">
          <span><span className="block font-medium">Conta nel patrimonio</span><span className="text-sm text-muted">Togli la spunta per conti condivisi o di passaggio.</span></span>
          <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />
        </label>
        <button onClick={save} disabled={busy || !name.trim()} className="btn btn-primary w-full py-3.5">{busy ? 'Salvo…' : account ? 'Salva modifiche' : 'Crea conto'}</button>
      </div>
    </Sheet>
  )
}
