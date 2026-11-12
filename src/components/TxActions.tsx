import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Tag, ArrowLeftRight, Split, Target, Wand2, Trash2, Plus, X } from 'lucide-react'
import { Sheet, useToast } from './ui'
import { Badge } from './Icon'
import { useQuickAdd } from './QuickAdd'
import { useCategories, useGoals, useInvalidate, useTransactions } from '../lib/data'
import { haptic } from '../lib/motion'
import { supabase } from '../lib/supabase'
import { saveRule, setCategory, setTransfer } from '../lib/sorting'
import { merchantKey, titleCase } from '../lib/finance'
import { money, parseAmount, round2 } from '../lib/format'
import type { Transaction } from '../lib/types'

type Panel = 'menu' | 'category' | 'split' | 'goal'
const Ctx = createContext<{ open: (t: Transaction, panel?: Panel) => void; remove: (t: Transaction) => void }>({ open: () => {}, remove: () => {} })
/** Azioni rapide su un movimento: menu, categoria, divisione, obiettivo, eliminazione con Annulla. */
export const useTxActions = () => useContext(Ctx)

export function TxActionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ t: Transaction; panel: Panel } | null>(null)
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const toast = useToast()

  const patchCache = (fn: (old: Transaction[]) => Transaction[]) => qc.setQueryData<Transaction[]>(['transactions'], (old = []) => fn(old))

  const remove = async (t: Transaction) => {
    const all = qc.getQueryData<Transaction[]>(['transactions']) ?? []
    const rows = t.transfer_group ? all.filter((x) => x.transfer_group === t.transfer_group) : [t]
    const ids = rows.map((x) => x.id)
    haptic('warning')
    patchCache((old) => old.filter((x) => !ids.includes(x.id)))
    const { error } = await supabase.from('transactions').delete().in('id', ids)
    if (error) { invalidate('transactions'); return toast('Eliminazione non riuscita', { tone: 'err' }) }
    invalidate('transactions')
    toast(rows.length > 1 ? 'Giroconto eliminato' : 'Movimento eliminato', {
      action: { label: 'Annulla', run: async () => {
        await supabase.from('transactions').insert(rows.map(({ created_at: _c, ...r }) => r))
        invalidate('transactions')
      } },
    })
  }

  return (
    <Ctx.Provider value={{ open: (t, panel = 'menu') => { haptic('light'); setState({ t, panel }) }, remove }}>
      {children}
      {state && (
        <ActionSheets t={state.t} panel={state.panel} setPanel={(panel) => setState({ ...state, panel })} onClose={() => setState(null)}
          onRemove={() => { const t = state.t; setState(null); remove(t) }} patchCache={patchCache} />
      )}
    </Ctx.Provider>
  )
}

function ActionSheets({ t, panel, setPanel, onClose, onRemove, patchCache }: {
  t: Transaction; panel: Panel; setPanel: (p: Panel) => void; onClose: () => void; onRemove: () => void
  patchCache: (fn: (old: Transaction[]) => Transaction[]) => void
}) {
  const qa = useQuickAdd()
  const invalidate = useInvalidate()
  const toast = useToast()
  const { data: categories = [] } = useCategories()
  const { data: goals = [] } = useGoals()
  const transfer = t.kind === 'transfer'
  const key = merchantKey(t.description)

  const pickCategory = async (id: string, remember: boolean) => {
    onClose(); haptic('success')
    patchCache((old) => old.map((x) => (x.id === t.id ? { ...x, category_id: id } : x)))
    await setCategory([t.id], id)
    if (remember) {
      await saveRule(key, 'category', id)
      // Applico la regola anche agli altri movimenti dello stesso esercente ancora da smistare
      const others = (await supabase.from('transactions').select('id, description').is('category_id', null).neq('kind', 'transfer')).data ?? []
      const same = others.filter((o) => merchantKey(o.description) === key).map((o) => o.id)
      if (same.length) { await setCategory(same, id); toast(`Sistemati anche altri ${same.length} movimenti di ${titleCase(key.toLowerCase())}`) }
    }
    invalidate('transactions', 'rules')
  }

  if (panel === 'category') return <CategorySheet t={t} onClose={onClose} onPick={pickCategory} categories={categories} />
  if (panel === 'split') return <SplitSheet t={t} onClose={onClose} />
  if (panel === 'goal') return (
    <Sheet open onClose={onClose} title="Collega a un obiettivo">
      <p className="mb-4 text-sm text-muted">L'importo conta come risparmio per l'obiettivo scelto.</p>
      {goals.filter((g) => !g.archived).length === 0 ? <p className="text-sm text-muted">Non hai ancora obiettivi: creane uno in Piano.</p> : (
        <div className="space-y-2">
          {goals.filter((g) => !g.archived).map((g) => (
            <button key={g.id} className={`press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${t.goal_id === g.id ? 'bg-brand-soft' : 'bg-sunken'}`} onClick={async () => {
              onClose(); haptic('success')
              const goal_id = t.goal_id === g.id ? null : g.id
              patchCache((old) => old.map((x) => (x.id === t.id ? { ...x, goal_id } : x)))
              await supabase.from('transactions').update({ goal_id }).eq('id', t.id)
              invalidate('transactions', 'goals')
              toast(goal_id ? `Collegato a ${g.name}` : 'Collegamento rimosso')
            }}>
              <Badge icon={g.icon} color={g.color} size={34} />
              <span className="flex-1 font-medium">{g.name}</span>
              {t.goal_id === g.id && <span className="text-xs font-semibold text-brand">Collegato</span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )

  const items: { icon: typeof Pencil; label: string; run: () => void; danger?: boolean; hide?: boolean }[] = [
    { icon: Pencil, label: 'Modifica', run: () => { onClose(); qa.edit(t) } },
    { icon: Tag, label: 'Cambia categoria', run: () => setPanel('category'), hide: transfer },
    { icon: ArrowLeftRight, label: 'Segna come giroconto', hide: transfer, run: async () => {
      onClose(); haptic('success')
      patchCache((old) => old.map((x) => (x.id === t.id ? { ...x, kind: 'transfer', category_id: null } : x)))
      await setTransfer([t.id]); invalidate('transactions')
    } },
    { icon: Split, label: 'Dividi in più categorie', run: () => setPanel('split'), hide: transfer || t.amount > 0 },
    { icon: Target, label: t.goal_id ? 'Obiettivo collegato' : 'Collega a un obiettivo', run: () => setPanel('goal') },
    { icon: Wand2, label: `Regola per ${titleCase(key.toLowerCase())}`, hide: transfer || !t.category_id || key.length < 3, run: async () => {
      onClose(); await saveRule(key, 'category', t.category_id); invalidate('rules'); toast('Regola salvata: i prossimi movimenti uguali si categorizzano da soli')
    } },
    { icon: Trash2, label: 'Elimina', danger: true, run: onRemove },
  ]
  return (
    <Sheet open onClose={onClose} title={t.description || 'Movimento'}>
      <p className={`num -mt-1 mb-4 text-2xl font-semibold ${t.amount > 0 && !transfer ? 'text-pos' : ''}`}>{t.amount > 0 ? '+' : '−'}{money(Math.abs(t.amount))}</p>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-sunken">
        {items.filter((i) => !i.hide).map(({ icon: I, label, run, danger }) => (
          <li key={label}>
            <button onClick={run} className={`press flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium ${danger ? 'text-neg' : ''}`}>
              <I size={19} className={danger ? '' : 'text-muted'} /> {label}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function CategorySheet({ t, onClose, onPick, categories }: { t: Transaction; onClose: () => void; onPick: (id: string, remember: boolean) => void; categories: { id: string; name: string; icon: string; color: string; kind: string; archived: boolean }[] }) {
  const [remember, setRemember] = useState(true)
  const { data: txs = [] } = useTransactions()
  const kind = t.amount > 0 ? 'income' : 'expense'
  const list = useMemo(() => {
    const u = new Map<string, number>()
    txs.slice(0, 500).forEach((x) => x.category_id && u.set(x.category_id, (u.get(x.category_id) ?? 0) + 1))
    return categories.filter((c) => c.kind === kind && !c.archived).sort((a, b) => (u.get(b.id) ?? 0) - (u.get(a.id) ?? 0))
  }, [categories, txs, kind])
  const key = merchantKey(t.description)
  return (
    <Sheet open onClose={onClose} title="Categoria">
      <div className="grid grid-cols-4 gap-1.5">
        {list.map((c) => (
          <button key={c.id} onClick={() => onPick(c.id, remember && key.length >= 3)}
            className={`press flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center text-[0.72rem] leading-tight ${t.category_id === c.id ? 'bg-brand-soft' : ''}`}>
            <Badge icon={c.icon} color={c.color} size={44} />
            <span className="line-clamp-2 w-full break-words">{c.name}</span>
          </button>
        ))}
      </div>
      {key.length >= 3 && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-sunken px-4 py-3 text-sm">
          <span>Vale per tutti i movimenti di <strong>{titleCase(key.toLowerCase())}</strong></span>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" />
        </label>
      )}
    </Sheet>
  )
}

/** Divide una spesa (es. scontrino del supermercato) in più movimenti con categorie diverse. */
function SplitSheet({ t, onClose }: { t: Transaction; onClose: () => void }) {
  const { data: categories = [] } = useCategories()
  const invalidate = useInvalidate()
  const toast = useToast()
  const total = Math.abs(t.amount)
  const cats = categories.filter((c) => c.kind === 'expense' && !c.archived)
  const [parts, setParts] = useState<{ cat: string; amount: string }[]>([
    { cat: t.category_id ?? '', amount: '' },
    { cat: '', amount: '' },
  ])
  const used = parts.slice(1).reduce((s, p) => s + (parseAmount(p.amount) ?? 0), 0)
  const first = round2(total - used)
  const ok = first > 0 && parts.every((p, i) => p.cat && (i === 0 || (parseAmount(p.amount) ?? 0) > 0))
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      // Il movimento originale tiene la prima parte (e il suo import_hash, così non si reimporta)
      await supabase.from('transactions').update({ amount: -first, category_id: parts[0].cat, notes: [t.notes, `Diviso da ${money(total)}`].filter(Boolean).join(' · ') }).eq('id', t.id)
      const extra = parts.slice(1).map((p) => ({
        account_id: t.account_id, date: t.date, amount: -round2(parseAmount(p.amount) ?? 0), description: t.description,
        category_id: p.cat, kind: 'expense', source: t.source === 'csv' ? 'manual' : t.source, notes: `Parte di ${money(total)}`,
      }))
      const { error } = await supabase.from('transactions').insert(extra)
      if (error) throw error
      haptic('success'); toast(`Diviso in ${parts.length} categorie`)
      onClose()
    } catch (e) { toast(`Non riuscito: ${(e as Error).message}`, { tone: 'err' }) }
    finally { setBusy(false); invalidate('transactions') }
  }

  return (
    <Sheet open onClose={onClose} title="Dividi la spesa">
      <p className="mb-4 text-sm text-muted">{t.description} · totale <strong className="num text-ink">{money(total)}</strong>. La prima riga prende quello che resta.</p>
      <div className="space-y-2.5">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <select className="field flex-1" value={p.cat} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, cat: e.target.value } : x)))}>
              <option value="">Categoria…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {i === 0 ? (
              <span className={`num w-28 rounded-xl bg-sunken px-3 py-3 text-right font-semibold ${first <= 0 ? 'text-neg' : ''}`}>{money(first)}</span>
            ) : (
              <input inputMode="decimal" className="field num !w-28 text-right" placeholder="0,00" value={p.amount}
                onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^0-9,.]/g, '') } : x)))} />
            )}
            {i > 1 && <button onClick={() => setParts(parts.filter((_, j) => j !== i))} className="rounded-full p-2 text-faint" aria-label="Rimuovi"><X size={17} /></button>}
          </div>
        ))}
      </div>
      <button onClick={() => setParts([...parts, { cat: '', amount: '' }])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand"><Plus size={16} /> Aggiungi una parte</button>
      <button disabled={!ok || busy} onClick={save} className="btn btn-primary mt-6 w-full py-3.5">{busy ? 'Salvo…' : 'Dividi'}</button>
    </Sheet>
  )
}
