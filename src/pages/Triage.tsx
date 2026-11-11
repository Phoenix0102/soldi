import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowLeftRight, SkipForward, PartyPopper } from 'lucide-react'
import { useAccounts, useCategories, useTransactions, useInvalidate } from '../lib/data'
import { ruleKeyFor } from '../lib/finance'
import { dayLabel, money } from '../lib/format'
import { haptic } from '../lib/motion'
import { useLearnRule } from '../lib/useLearnRule'
import { supabase } from '../lib/supabase'
import type { Transaction } from '../lib/types'
import { Link } from '../components/nav'
import { Badge } from '../components/Icon'
import { Bar, Empty, SkeletonPage, useToast } from '../components/ui'

/** Smistamento rapido: un movimento alla volta, una categoria con un tocco. */
export default function Triage() {
  const { data: txs, isLoading } = useTransactions()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const learn = useLearnRule()
  const toast = useToast()
  const [skipped, setSkipped] = useState<string[]>([])
  const [remember, setRemember] = useState(true)
  const [done, setDone] = useState(0)
  const [anim, setAnim] = useState(0)

  const queue = useMemo(() => (txs ?? []).filter((t) => !t.category_id && t.kind !== 'transfer' && !skipped.includes(t.id)), [txs, skipped])
  const total = queue.length + done
  const t = queue[0]
  const accName = new Map(accounts.map((a) => [a.id, a.name]))

  // Categorie ordinate per uso, separate per uscite ed entrate
  const cats = useMemo(() => {
    const usage = new Map<string, number>()
    ;(txs ?? []).forEach((x) => x.category_id && usage.set(x.category_id, (usage.get(x.category_id) ?? 0) + 1))
    const kind = t && t.amount > 0 ? 'income' : 'expense'
    return categories.filter((c) => c.kind === kind && !c.archived).sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
  }, [categories, txs, t])

  if (isLoading) return <SkeletonPage />

  const patch = (id: string, p: Partial<Transaction>) =>
    qc.setQueryData<Transaction[]>(['transactions'], (old = []) => old.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const assign = async (categoryId: string) => {
    if (!t) return
    haptic(); setAnim((n) => n + 1); setDone((n) => n + 1)
    patch(t.id, { category_id: categoryId })
    const { error } = await supabase.from('transactions').update({ category_id: categoryId }).eq('id', t.id)
    if (error) { patch(t.id, { category_id: null }); return toast('Non salvato, riprova', { tone: 'err' }) }
    if (remember) {
      const r = await learn(t.description, categoryId)
      if (r.applied) { setDone((n) => n + r.applied); toast(`Sistemati anche altri ${r.applied} movimenti di ${r.pattern}`) }
    } else invalidate('transactions')
  }

  const markTransfer = async () => {
    if (!t) return
    haptic(); setAnim((n) => n + 1); setDone((n) => n + 1)
    patch(t.id, { kind: 'transfer' })
    await supabase.from('transactions').update({ kind: 'transfer', category_id: null }).eq('id', t.id)
    invalidate('transactions')
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/movimenti" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={16} /> Movimenti</Link>
      <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em]">Smista</h1>
      <p className="mt-1 text-muted">Un tocco per movimento. Con "Ricorda" l'app impara l'esercente e sistema anche gli altri uguali.</p>

      {total > 0 && <div className="mt-5"><Bar value={done} max={total} tone={!t ? 'gold' : 'brand'} /><p className="mt-1.5 text-xs text-muted">{done} di {total}</p></div>}

      {!t ? (
        <div className="mt-8">
          <Empty title={done ? 'Tutto in ordine' : 'Niente da smistare'} text={done ? `Hai categorizzato ${done} movimenti.` : 'Tutti i movimenti hanno una categoria.'}
            action={<span className="inline-flex text-gold"><PartyPopper /></span>} />
          {skipped.length > 0 && <button className="btn btn-ghost mt-4 w-full" onClick={() => setSkipped([])}>Rivedi i {skipped.length} saltati</button>}
        </div>
      ) : (
        <div key={anim} className="swipe-in-left mt-6">
          <article className="rounded-[28px] bg-surface p-6 text-center">
            <p className="text-sm text-muted capitalize">{dayLabel(t.date)}, {accName.get(t.account_id)}</p>
            <p className="mt-2 text-xl font-semibold leading-snug">{t.description || 'Senza descrizione'}</p>
            <p className={`num mt-3 text-4xl font-semibold tracking-[-0.03em] ${t.amount > 0 ? 'text-pos' : ''}`}>{t.amount > 0 ? '+' : '−'}{money(Math.abs(t.amount))}</p>
            {t.notes && <p className="mt-2 text-sm text-muted">{t.notes}</p>}
          </article>

          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {cats.map((c) => (
              <button key={c.id} onClick={() => assign(c.id)} className="press flex flex-col items-center gap-1.5 rounded-2xl p-2 text-center text-[0.72rem] leading-tight hover:bg-sunken">
                <Badge icon={c.icon} color={c.color} size={42} />
                <span className="line-clamp-2 w-full hyphens-auto break-words">{c.name}</span>
              </button>
            ))}
          </div>

          <label className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
            <span>Ricorda per <strong>{ruleKeyFor(t.description) || 'questo esercente'}</strong></span>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" disabled={ruleKeyFor(t.description).length < 3} />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button className="btn btn-ghost" onClick={markTransfer}><ArrowLeftRight size={16} /> È un giroconto</button>
            <button className="btn btn-ghost" onClick={() => { setSkipped((s) => [...s, t.id]); setAnim((n) => n + 1) }}><SkipForward size={16} /> Salta</button>
          </div>
        </div>
      )}
    </div>
  )
}
