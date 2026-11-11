import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, ArrowRight, Trash2, Loader2 } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { Sheet, Segmented, useToast, Label } from './ui'
import { Badge } from './Icon'
import { useAccounts, useCategories, useRules, useTransactions, useInvalidate } from '../lib/data'
import { haptic } from '../lib/motion'
import { supabase } from '../lib/supabase'
import { applyRules, ruleKeyFor, suggestFromHistory } from '../lib/finance'
import { useLearnRule } from '../lib/useLearnRule'
import { parseAmount, todayISO, money, round2 } from '../lib/format'
import type { AccountBalance, Transaction } from '../lib/types'

type Mode = 'expense' | 'income' | 'transfer'
interface Prefill { mode?: Mode; amount?: number; description?: string; date?: string; account_id?: string; category_id?: string; source?: Transaction['source'] }

const Ctx = createContext<{ open: (p?: Prefill) => void; edit: (t: Transaction) => void }>({ open: () => {}, edit: () => {} })
export const useQuickAdd = () => useContext(Ctx)

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; prefill?: Prefill; editing?: Transaction }>({ open: false })
  const { pathname } = useLocation()
  useEffect(() => { setState({ open: false }) }, [pathname])
  return (
    <Ctx.Provider value={{ open: (p) => setState({ open: true, prefill: p }), edit: (t) => setState({ open: true, editing: t }) }}>
      {children}
      {state.open && <QuickAddSheet prefill={state.prefill} editing={state.editing} onClose={() => setState({ open: false })} />}
    </Ctx.Provider>
  )
}

const LAST_ACC = 'soldi-last-account'

function QuickAddSheet({ prefill, editing, onClose }: { prefill?: Prefill; editing?: Transaction; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: rules = [] } = useRules()
  const { data: txs = [] } = useTransactions()
  const invalidate = useInvalidate()
  const toast = useToast()

  const pair = editing?.transfer_group ? txs.filter((t) => t.transfer_group === editing.transfer_group) : []
  const initialMode: Mode = editing ? editing.kind : prefill?.mode ?? 'expense'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [amountStr, setAmountStr] = useState(editing ? String(Math.abs(editing.amount)).replace('.', ',') : prefill?.amount ? String(prefill.amount).replace('.', ',') : '')
  const [desc, setDesc] = useState(editing?.description ?? prefill?.description ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [date, setDate] = useState(editing?.date ?? prefill?.date ?? todayISO())
  const active = accounts.filter((a) => !a.archived)
  const defaultAcc = prefill?.account_id ?? localStorage.getItem(LAST_ACC) ?? active[0]?.id ?? ''
  const fromTx = pair.find((t) => t.amount < 0), toTx = pair.find((t) => t.amount > 0)
  const [accountId, setAccountId] = useState(editing ? (editing.kind === 'transfer' ? fromTx?.account_id ?? editing.account_id : editing.account_id) : defaultAcc)
  const [toAccountId, setToAccountId] = useState(toTx?.account_id ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? prefill?.category_id ?? null)
  const [catTouched, setCatTouched] = useState(!!editing?.category_id || !!prefill?.category_id)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState<number | null>(null)
  const [source, setSource] = useState<Transaction['source']>(prefill?.source ?? 'manual')
  const fileRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!accountId && active[0]) setAccountId(active[0].id) }, [active, accountId])
  useEffect(() => { setTimeout(() => amountRef.current?.focus(), 250) }, [])

  // Categorie ordinate per frequenza d'uso
  const cats = useMemo(() => {
    const kind = mode === 'income' ? 'income' : 'expense'
    const usage = new Map<string, number>()
    txs.slice(0, 400).forEach((t) => t.category_id && usage.set(t.category_id, (usage.get(t.category_id) ?? 0) + 1))
    return categories.filter((c) => c.kind === kind && !c.archived).sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.sort - b.sort)
  }, [categories, txs, mode])

  // Categoria suggerita dalla descrizione
  useEffect(() => {
    if (catTouched || mode === 'transfer' || desc.length < 3) return
    const sign = mode === 'income' ? 1 : -1
    const hit = applyRules(desc, rules, categories, sign)?.category_id ?? suggestFromHistory(desc, txs)
    if (hit && cats.some((c) => c.id === hit)) setCategoryId(hit)
  }, [desc, rules, categories, txs, mode, catTouched, cats])

  const amount = parseAmount(amountStr) ?? 0
  const canSave = amount > 0 && accountId && (mode !== 'transfer' || (toAccountId && toAccountId !== accountId))

  const onScan = async (file: File) => {
    setScan(0)
    try {
      const { readReceipt } = await import('../lib/receipt')
      const r = await readReceipt(file, (p) => setScan(p))
      if (r.amount) setAmountStr(String(r.amount).replace('.', ','))
      if (r.date) setDate(r.date)
      if (r.merchant && !desc) setDesc(r.merchant)
      setMode('expense'); setSource('receipt')
      toast(r.amount ? 'Scontrino letto. Controlla i dati prima di salvare.' : 'Non ho trovato il totale: inseriscilo a mano.', { tone: r.amount ? 'ok' : 'err' })
    } catch {
      toast('Lettura non riuscita. Riprova con una foto più nitida.', { tone: 'err' })
    } finally { setScan(null) }
  }

  const qc = useQueryClient()
  const learn = useLearnRule()

  /** Aggiorna subito la cache: la lista e i saldi cambiano prima ancora che il server risponda. */
  const applyLocal = (remove: string[], add: Transaction[]) => {
    const prevTx = qc.getQueryData<Transaction[]>(['transactions'])
    const prevBal = qc.getQueryData<AccountBalance[]>(['balances'])
    const removed = (prevTx ?? []).filter((t) => remove.includes(t.id))
    qc.setQueryData<Transaction[]>(['transactions'], (old = []) =>
      [...add, ...old.filter((t) => !remove.includes(t.id))].sort((x, y) => (x.date === y.date ? y.created_at.localeCompare(x.created_at) : y.date.localeCompare(x.date))))
    qc.setQueryData<AccountBalance[]>(['balances'], (old) => {
      if (!old) return old
      const delta = new Map<string, number>()
      removed.forEach((t) => delta.set(t.account_id, (delta.get(t.account_id) ?? 0) - t.amount))
      add.forEach((t) => delta.set(t.account_id, (delta.get(t.account_id) ?? 0) + t.amount))
      return old.map((b) => (delta.has(b.account_id) ? { ...b, balance: round2(b.balance + delta.get(b.account_id)!) } : b))
    })
    return () => { qc.setQueryData(['transactions'], prevTx); qc.setQueryData(['balances'], prevBal) }
  }

  const makeTx = (p: Partial<Transaction>): Transaction => ({
    id: crypto.randomUUID(), account_id: accountId, date, amount: 0, description: '', category_id: null, notes: notes || null,
    kind: 'expense', transfer_group: null, recurring_id: null, source: 'manual', import_hash: null, created_at: new Date().toISOString(), ...p,
  })

  const save = async () => {
    if (!canSave || busy) return
    setBusy(true)
    const a = round2(amount)
    let rows: Transaction[]
    if (mode === 'transfer') {
      const from = accounts.find((x) => x.id === accountId)!, to = accounts.find((x) => x.id === toAccountId)!
      const group = crypto.randomUUID()
      rows = [
        makeTx({ account_id: from.id, amount: -a, kind: 'transfer', description: desc || `Giroconto verso ${to.name}`, transfer_group: group }),
        makeTx({ account_id: to.id, amount: a, kind: 'transfer', description: desc || `Giroconto da ${from.name}`, transfer_group: group }),
      ]
    } else {
      rows = [makeTx({
        id: editing && !editing.transfer_group ? editing.id : crypto.randomUUID(),
        amount: mode === 'expense' ? -a : a, kind: mode, category_id: categoryId,
        description: desc.trim() || cats.find((c) => c.id === categoryId)?.name || (mode === 'expense' ? 'Spesa' : 'Entrata'),
        source: editing && !editing.transfer_group ? editing.source : source,
        import_hash: editing && !editing.transfer_group ? editing.import_hash : null,
        created_at: editing?.created_at ?? new Date().toISOString(),
      })]
    }
    const oldIds = editing ? (editing.transfer_group ? pair.map((t) => t.id) : [editing.id]) : []
    const rollback = applyLocal(oldIds, rows)
    localStorage.setItem(LAST_ACC, accountId)
    haptic()
    // Categoria cambiata a mano: propongo di ricordarla per quell'esercente
    const changedCat = editing && mode !== 'transfer' && categoryId && categoryId !== editing.category_id && ruleKeyFor(rows[0].description).length >= 3
    const key = changedCat ? ruleKeyFor(rows[0].description) : ''
    toast(editing ? 'Movimento aggiornato' : mode === 'transfer' ? 'Giroconto salvato' : mode === 'expense' ? `Spesa di ${money(a)} salvata` : `Entrata di ${money(a)} salvata`,
      changedCat ? { action: { label: `Usa sempre per ${key}`, run: async () => {
        const r = await learn(rows[0].description, categoryId!)
        toast(r.applied ? `Regola creata, applicata ad altri ${r.applied} movimenti` : 'Regola creata')
      } } } : undefined)
    onClose()
    try {
      const strip = ({ created_at: _c, ...r }: Transaction) => r
      if (editing && !editing.transfer_group && mode !== 'transfer') {
        const { error } = await supabase.from('transactions').update(strip(rows[0])).eq('id', editing.id)
        if (error) throw error
      } else {
        if (oldIds.length) {
          const { error } = await supabase.from('transactions').delete().in('id', oldIds)
          if (error) throw error
        }
        const { error } = await supabase.from('transactions').insert(rows.map(strip))
        if (error) throw error
      }
    } catch (e) {
      rollback()
      toast(`Non salvato: ${(e as Error).message}`, { tone: 'err' })
    } finally {
      invalidate('transactions')
    }
  }

  const remove = async () => {
    if (!editing) return
    const rows = editing.transfer_group ? pair : [editing]
    const ids = rows.map((t) => t.id)
    const rollback = applyLocal(ids, [])
    haptic()
    onClose()
    const { error } = await supabase.from('transactions').delete().in('id', ids)
    if (error) { rollback(); return toast('Eliminazione non riuscita', { tone: 'err' }) }
    invalidate('transactions')
    toast(rows.length > 1 ? 'Giroconto eliminato' : 'Movimento eliminato', {
      action: {
        label: 'Annulla',
        run: async () => {
          applyLocal([], rows)
          const { error: e2 } = await supabase.from('transactions').insert(rows.map(({ created_at: _c, ...r }) => r))
          if (e2) toast('Ripristino non riuscito', { tone: 'err' })
          invalidate('transactions')
        },
      },
    })
  }

  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  return (
    <Sheet open onClose={onClose} title={editing ? 'Modifica movimento' : 'Nuovo movimento'}>
      <div className="flex items-center justify-between gap-3">
        <Segmented value={mode} onChange={(m) => { setMode(m); if (!editing) { setCategoryId(null); setCatTouched(false) } if (!amountStr) amountRef.current?.focus() }}
          options={[{ value: 'expense', label: 'Uscita' }, { value: 'income', label: 'Entrata' }, { value: 'transfer', label: 'Giroconto' }]} />
        {!editing && (
          <>
            <button onClick={() => fileRef.current?.click()} className="btn btn-ghost !px-3" aria-label="Scansiona scontrino" title="Scansiona scontrino">
              {scan !== null ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onScan(e.target.files[0])} />
          </>
        )}
      </div>
      {scan !== null && <p className="mt-2 text-sm text-muted">Leggo lo scontrino… {Math.round(scan * 100)}%</p>}

      <label className="mt-5 block">
        <span className="sr-only">Importo</span>
        <div className={`flex items-baseline gap-2 border-b-2 pb-2 ${mode === 'income' ? 'border-pos' : 'border-ink'}`}>
          <span className="text-3xl font-medium text-muted">€</span>
          <input ref={amountRef} inputMode="decimal" value={amountStr} placeholder="0,00"
            onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9,.]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            className={`num w-full bg-transparent text-5xl font-semibold tracking-[-0.03em] outline-none placeholder:text-faint ${mode === 'income' ? 'text-pos' : ''}`} />
        </div>
      </label>

      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={mode === 'transfer' ? 'Descrizione (facoltativa)' : 'Dove o cosa? Es. Esselunga'}
        className="field mt-4" onKeyDown={(e) => e.key === 'Enter' && save()} />

      {mode !== 'transfer' ? (
        <div className="mt-5">
          <Label>Categoria</Label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {cats.map((c) => (
              <button key={c.id} onClick={() => { setCategoryId(c.id === categoryId ? null : c.id); setCatTouched(true) }}
                className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center text-[0.72rem] leading-tight transition ${categoryId === c.id ? 'bg-brand-soft ring-2 ring-brand' : 'hover:bg-sunken'}`}>
                <Badge icon={c.icon} color={c.color} size={36} />
                <span className="line-clamp-2 w-full hyphens-auto break-words">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <Label>{mode === 'transfer' ? 'Da' : 'Conto'}</Label>
        <AccountChips value={accountId} onChange={setAccountId} />
      </div>
      {mode === 'transfer' && (
        <div className="mt-3">
          <Label><span className="inline-flex items-center gap-1"><ArrowRight size={14} /> A</span></Label>
          <AccountChips value={toAccountId} onChange={setToAccountId} exclude={accountId} />
        </div>
      )}

      <div className="mt-5">
        <Label>Data</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Chip on={date === todayISO()} onClick={() => setDate(todayISO())}>Oggi</Chip>
          <Chip on={date === yesterday} onClick={() => setDate(yesterday)}>Ieri</Chip>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="field !w-auto !py-1.5" />
        </div>
      </div>

      <details className="mt-4" open={!!notes}>
        <summary className="cursor-pointer text-sm text-muted">Aggiungi una nota</summary>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="field mt-2" />
      </details>

      <div className="mt-6 flex gap-3">
        {editing && <button onClick={remove} className="btn btn-danger" aria-label="Elimina"><Trash2 size={18} /></button>}
        <button onClick={save} disabled={!canSave || busy} className="btn btn-primary flex-1 py-3.5 text-base">
          {busy ? 'Salvo…' : editing ? 'Salva modifiche' : 'Salva'}
        </button>
      </div>
    </Sheet>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? 'bg-ink text-paper' : 'bg-sunken text-ink hover:bg-line'}`}>{children}</button>
}

export function AccountChips({ value, onChange, exclude }: { value: string; onChange: (id: string) => void; exclude?: string }) {
  const { data: accounts = [] } = useAccounts()
  return (
    <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
      {accounts.filter((a) => !a.archived && a.id !== exclude).map((a) => (
        <button key={a.id} onClick={() => onChange(a.id)}
          className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-medium transition ${value === a.id ? 'bg-ink text-paper' : 'bg-sunken hover:bg-line'}`}>
          <span className="h-6 w-6 rounded-full" style={{ background: a.color }} />
          {a.name}
        </button>
      ))}
    </div>
  )
}
