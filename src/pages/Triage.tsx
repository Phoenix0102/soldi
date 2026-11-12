import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, SkipForward, PartyPopper, Sparkles, Check, Landmark, Loader2, ChevronRight } from 'lucide-react'
import { useAccounts, useCategories, useTransactions, useInvalidate } from '../lib/data'
import { merchantKey, titleCase } from '../lib/finance'
import { money, shortDate } from '../lib/format'
import { haptic } from '../lib/motion'
import { payDebt, saveRule, setCategory, setTransfer } from '../lib/sorting'
import { supabase } from '../lib/supabase'
import type { Account, Category, Transaction } from '../lib/types'
import { Link } from '../components/nav'
import { BackButton } from '../components/back'
import { Badge } from '../components/Icon'
import { Bar, Empty, Sheet, SkeletonPage, useToast } from '../components/ui'

type Group = { id: string; key: string; sign: 'in' | 'out'; txs: Transaction[]; total: number }
type Suggestion = string // id categoria oppure 'transfer'

async function ai<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('categorize', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    throw new Error((ctx ? await ctx.json().then((j) => j.error).catch(() => null) : null) ?? error.message)
  }
  return data as T
}

/** Smistamento per esercente: un gruppo alla volta, una scelta vale per tutti i movimenti uguali. */
export default function Triage() {
  const { data: txs, isLoading } = useTransactions()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [skipped, setSkipped] = useState<string[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [suggest, setSuggest] = useState<Record<string, Suggestion>>({})
  const [asking, setAsking] = useState(false)
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  const [debtPick, setDebtPick] = useState(false)
  const startCount = useRef<number | null>(null)
  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: () => ai<{ configured: boolean }>({ action: 'status' }), staleTime: 5 * 60_000 })

  // Gruppi: stesso esercente e stesso verso (entrata/uscita)
  const groups = useMemo(() => {
    const m = new Map<string, Group>()
    for (const t of txs ?? []) {
      if (t.category_id || t.kind === 'transfer') continue
      const key = merchantKey(t.description)
      const sign = t.amount > 0 ? 'in' : 'out'
      const id = `${sign}:${key}`
      const g = m.get(id) ?? { id, key, sign, txs: [], total: 0 }
      g.txs.push(t); g.total += t.amount
      m.set(id, g)
    }
    return [...m.values()].sort((a, b) => b.txs.length - a.txs.length || Math.abs(b.total) - Math.abs(a.total))
  }, [txs])
  if (txs && startCount.current === null) startCount.current = groups.length

  const queue = groups.filter((g) => !skipped.includes(g.id))
  const g = (pick && queue.find((x) => x.id === pick)) || queue[0]
  const usage = useMemo(() => {
    const u = new Map<string, number>()
    ;(txs ?? []).forEach((x) => x.category_id && u.set(x.category_id, (u.get(x.category_id) ?? 0) + 1))
    return u
  }, [txs])
  const cats = useMemo(() => {
    const kind = g?.sign === 'in' ? 'income' : 'expense'
    return categories.filter((c) => c.kind === kind && !c.archived).sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
  }, [categories, usage, g?.sign])
  const debts = accounts.filter((a) => a.type === 'debt' && !a.archived)

  if (isLoading || !txs) return <SkeletonPage />

  const totalGroups = Math.max(startCount.current ?? 0, groups.length)
  const doneGroups = totalGroups - groups.length
  const remainingTx = groups.reduce((s, x) => s + x.txs.length, 0)

  // Aggiornamento immediato della cache, poi salvataggio
  const patch = (ids: string[], p: Partial<Transaction>) =>
    qc.setQueryData<Transaction[]>(['transactions'], (old = []) => old.map((x) => (ids.includes(x.id) ? { ...x, ...p } : x)))

  const resolve = async (grp: Group, s: Suggestion | { debt: string }, opts: { quiet?: boolean; remember?: boolean } = {}) => {
    const ids = grp.txs.map((t) => t.id)
    const keep = opts.remember ?? remember
    if (typeof s === 'object') {
      patch(ids, { kind: 'transfer', category_id: null })
      await payDebt(grp.txs, s.debt)
      if (keep) await saveRule(grp.key, 'debt', null, s.debt)
    } else if (s === 'transfer') {
      patch(ids, { kind: 'transfer', category_id: null })
      await setTransfer(ids)
      if (keep) await saveRule(grp.key, 'transfer', null)
    } else {
      patch(ids, { category_id: s })
      await setCategory(ids, s)
      if (keep) await saveRule(grp.key, 'category', s)
    }
    if (!opts.quiet) invalidate('transactions', 'rules')
  }

  const act = async (s: Suggestion | { debt: string }) => {
    if (!g || busy) return
    setBusy(true); setPick(null)
    haptic('success')
    try { await resolve(g, s) } catch (e) { toast(`Non salvato: ${(e as Error).message}`, { tone: 'err' }); invalidate('transactions') }
    finally { setBusy(false) }
  }

  const askAi = async () => {
    setAsking(true)
    try {
      const items = queue.slice(0, 80).map((x) => ({ key: x.key, sign: x.sign, count: x.txs.length, total: x.total, samples: [...new Set(x.txs.map((t) => t.description))].slice(0, 3) }))
      const r = await ai<{ suggestions: Record<string, Suggestion> }>({ action: 'suggest', items, categories: categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, kind: c.kind })) })
      const byId: Record<string, Suggestion> = {}
      for (const x of queue) { const v = r.suggestions[x.key]; if (v) byId[x.id] = v }
      setSuggest(byId)
      const n = Object.keys(byId).length
      toast(n ? `${n} ${n === 1 ? 'gruppo riconosciuto' : 'gruppi riconosciuti'}` : 'Nessun suggerimento sicuro', { tone: n ? 'ok' : 'err' })
    } catch (e) { toast((e as Error).message, { tone: 'err' }) }
    finally { setAsking(false) }
  }

  const acceptAll = async () => {
    const todo = queue.filter((x) => suggest[x.id])
    setBulk({ done: 0, total: todo.length })
    try {
      for (let i = 0; i < todo.length; i++) {
        await resolve(todo[i], suggest[todo[i].id], { quiet: true, remember: true })
        setBulk({ done: i + 1, total: todo.length })
      }
      haptic('success')
      toast(`Sistemati ${todo.reduce((s, x) => s + x.txs.length, 0)} movimenti`)
    } catch (e) { toast(`Interrotto: ${(e as Error).message}`, { tone: 'err' }) }
    finally { setBulk(null); invalidate('transactions', 'rules') }
  }

  const sug = g ? suggest[g.id] : undefined
  const sugCat = sug && sug !== 'transfer' ? categories.find((c) => c.id === sug) : undefined
  const pending = queue.filter((x) => suggest[x.id]).length

  return (
    <div className="mx-auto max-w-xl">
      <BackButton label="Movimenti" fallback="/movimenti" always />
      <h1 className="text-[1.9rem] leading-tight font-semibold tracking-[-0.02em]">Smista</h1>
      <p className="mt-1 text-muted">
        {groups.length ? <>{remainingTx} movimenti in <strong className="text-ink">{groups.length} gruppi</strong>. Una scelta vale per tutto il gruppo.</> : 'Tutti i movimenti hanno una categoria.'}
      </p>

      {totalGroups > 0 && <div className="mt-4"><Bar value={doneGroups} max={totalGroups} tone={!g ? 'gold' : 'brand'} /></div>}

      {/* Suggerimenti AI */}
      {g && aiStatus.data?.configured && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3">
          <Sparkles size={18} className="shrink-0 text-brand" />
          {bulk ? (
            <p className="flex-1 text-sm font-medium">Applico i suggerimenti… {bulk.done}/{bulk.total}</p>
          ) : pending ? (
            <>
              <p className="flex-1 text-sm"><strong>{pending}</strong> {pending === 1 ? 'gruppo ha' : 'gruppi hanno'} un suggerimento</p>
              <button className="btn btn-primary !py-1.5 text-sm" onClick={acceptAll}>Accetta tutti</button>
            </>
          ) : (
            <>
              <p className="flex-1 text-sm">L'AI può proporre la categoria per ogni gruppo</p>
              <button className="btn btn-primary !py-1.5 text-sm" disabled={asking} onClick={askAi}>{asking ? <Loader2 size={15} className="animate-spin" /> : 'Suggerisci'}</button>
            </>
          )}
        </div>
      )}
      {g && aiStatus.data && !aiStatus.data.configured && (
        <Link to="/impostazioni/collegamenti" className="mt-4 flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
          <Sparkles size={17} className="text-faint" /><span className="flex-1 text-muted">Attiva i suggerimenti automatici con l'AI</span><ChevronRight size={16} className="text-faint" />
        </Link>
      )}

      {!g ? (
        <div className="mt-8">
          <Empty title={doneGroups ? 'Tutto in ordine' : 'Niente da smistare'} text={doneGroups ? `Hai sistemato ${doneGroups} gruppi di movimenti.` : 'Tutti i movimenti hanno una categoria.'}
            action={<span className="inline-flex text-gold"><PartyPopper /></span>} />
          {skipped.length > 0 && <button className="btn btn-ghost mt-4 w-full" onClick={() => setSkipped([])}>Rivedi i {skipped.length} gruppi saltati</button>}
        </div>
      ) : (
        <div key={g.id} className="step-in mt-5">
          <GroupCard g={g} account={(id) => accounts.find((a) => a.id === id)} />

          {sug && (
            <button disabled={busy} onClick={() => act(sug)} className="press mt-3 flex w-full items-center gap-3 rounded-2xl border-2 border-brand bg-surface px-4 py-3 text-left">
              {sugCat ? <Badge icon={sugCat.icon} color={sugCat.color} size={36} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken"><ArrowLeftRight size={17} /></span>}
              <span className="flex-1"><span className="block text-xs font-medium text-brand">Suggerito dall'AI</span><span className="block font-semibold">{sugCat?.name ?? 'Giroconto tra i tuoi conti'}</span></span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"><Check size={15} /> Conferma</span>
            </button>
          )}

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {cats.map((c) => <CatButton key={c.id} c={c} onClick={() => act(c.id)} disabled={busy} />)}
          </div>

          <div className={`mt-4 grid gap-2 ${g.sign === 'out' && debts.length ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button className="btn btn-ghost !px-2 text-sm" disabled={busy} onClick={() => act('transfer')}><ArrowLeftRight size={16} /> Giroconto</button>
            {g.sign === 'out' && debts.length > 0 && (
              <button className="btn btn-ghost !px-2 text-sm" disabled={busy} onClick={() => (debts.length === 1 ? act({ debt: debts[0].id }) : setDebtPick(true))}><Landmark size={16} /> Rata</button>
            )}
            <button className="btn btn-ghost !px-2 text-sm" disabled={busy} onClick={() => { haptic('tick'); setSkipped((s) => [...s, g.id]); setPick(null) }}><SkipForward size={16} /> Salta</button>
          </div>

          <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
            <span>Ricorda per i prossimi movimenti di <strong>{titleCase(g.key.toLowerCase())}</strong></span>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" disabled={g.key.length < 3} />
          </label>

          {queue.length > 1 && (
            <section className="mt-8">
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-faint uppercase">Dopo</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
                {queue.filter((x) => x.id !== g.id).slice(0, 6).map((x) => (
                  <li key={x.id}>
                    <button onClick={() => { haptic('tick'); setPick(x.id) }} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{titleCase(x.key.toLowerCase())}</span>
                        <span className="block text-xs text-muted">{x.txs.length} {x.txs.length === 1 ? 'movimento' : 'movimenti'}{suggest[x.id] ? ' · suggerimento pronto' : ''}</span>
                      </span>
                      <span className={`num text-sm font-semibold ${x.total > 0 ? 'text-pos' : ''}`}>{x.total > 0 ? '+' : '−'}{money(Math.abs(x.total), true)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <Sheet open={debtPick} onClose={() => setDebtPick(false)} title="Quale debito riduce?">
        <div className="space-y-2">
          {debts.map((d) => (
            <button key={d.id} className="press flex w-full items-center gap-3 rounded-2xl bg-sunken px-4 py-3 text-left" onClick={() => { setDebtPick(false); act({ debt: d.id }) }}>
              <span className="h-8 w-8 rounded-xl" style={{ background: d.color }} /><span className="font-medium">{d.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function GroupCard({ g, account }: { g: Group; account: (id: string) => Account | undefined }) {
  const [open, setOpen] = useState(false)
  const dates = g.txs.map((t) => t.date).sort()
  const shown = open ? g.txs : g.txs.slice(0, 3)
  return (
    <article className="rounded-[28px] bg-surface p-5">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted">
        <span className="rounded-full bg-sunken px-2.5 py-1">{g.txs.length} {g.txs.length === 1 ? 'movimento' : 'movimenti'}</span>
        <span>{dates.length > 1 ? `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}` : shortDate(dates[0])}</span>
      </div>
      <h2 className="mt-3 text-2xl leading-tight font-semibold tracking-[-0.02em] break-words">{titleCase(g.key.toLowerCase())}</h2>
      <p className={`num mt-1 text-3xl font-semibold tracking-[-0.03em] ${g.total > 0 ? 'text-pos' : ''}`}>{g.total > 0 ? '+' : '−'}{money(Math.abs(g.total))}</p>
      <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
        {shown.map((t) => (
          <li key={t.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-muted">{shortDate(t.date)} · {t.description}{account(t.account_id) ? ` · ${account(t.account_id)!.name}` : ''}</span>
            <span className="num shrink-0">{money(Math.abs(t.amount))}</span>
          </li>
        ))}
      </ul>
      {g.txs.length > 3 && (
        <button onClick={() => setOpen(!open)} className="mt-2 text-sm font-medium text-brand">{open ? 'Mostra meno' : `Mostra tutti (${g.txs.length})`}</button>
      )}
    </article>
  )
}

function CatButton({ c, onClick, disabled }: { c: Category; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="press flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center text-[0.72rem] leading-tight hover:bg-sunken disabled:opacity-50">
      <Badge icon={c.icon} color={c.color} size={44} />
      <span className="line-clamp-2 w-full hyphens-auto break-words">{c.name}</span>
    </button>
  )
}
