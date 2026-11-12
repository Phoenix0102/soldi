/* Abbonamenti e spese fisse: un solo elenco (le tue ricorrenti), diviso in abbonamenti, rate e
   spese fisse, entrate fisse. Sotto, quello che l'app ha trovato nei movimenti e non è ancora in elenco. */
import { useMemo, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Plus, TrendingUp, Sparkles, X } from 'lucide-react'
import { useCategories, useRecurring, useTable, useTransactions } from '../lib/data'
import { detectSubscriptions, recurringGroup, suggestRecurring, GROUP_LABEL, type RecurringGroup } from '../lib/subscriptions'
import { monthlyEquivalent } from '../lib/finance'
import { money, percent, shortDate } from '../lib/format'
import { FREQUENCIES, type Recurring } from '../lib/types'
import { BackButton } from '../components/back'
import { Badge } from '../components/Icon'
import { Empty, PageHeader, SkeletonPage, useToast } from '../components/ui'
import { SwipeDismiss, DismissX } from '../components/SwipeDismiss'
import { RecurringForm, useRecordRecurring } from '../components/RecurringForm'
import { haptic } from '../lib/motion'

const IGNORED = 'soldi-recurring-ignored'
const readIgnored = () => { try { return new Set(JSON.parse(localStorage.getItem(IGNORED) ?? '[]') as string[]) } catch { return new Set<string>() } }

export default function Subscriptions() {
  const { data: items, isLoading } = useRecurring()
  const { data: txs = [] } = useTransactions()
  const { data: categories = [] } = useCategories()
  const { insert } = useTable<Recurring & Record<string, unknown>>('recurring')
  const record = useRecordRecurring()
  const toast = useToast()
  const [form, setForm] = useState<Recurring | 'new' | null>(null)
  const [ignored, setIgnored] = useState(readIgnored)
  const ignore = (keys: string[]) => {
    const next = new Set([...ignored, ...keys])
    try { localStorage.setItem(IGNORED, JSON.stringify([...next].slice(-300))) } catch { /* ignoro */ }
    setIgnored(next)
  }
  const suggestions = useMemo(() => suggestRecurring(txs, categories, items ?? []).filter((s) => !ignored.has(s.key)), [txs, categories, items, ignored])
  const hikes = useMemo(() => detectSubscriptions(txs, categories).filter((s) => s.active && s.hike), [txs, categories])
  const { update } = useTable<Recurring & Record<string, unknown>>('recurring')
  if (isLoading || !items) return <SkeletonPage />

  const catOf = (id: string | null) => categories.find((c) => c.id === id)
  const active = items.filter((r) => r.active)
  const groupOf = (r: Recurring) => recurringGroup(r, catOf(r.category_id)?.name)
  const groups = (['subscription', 'fixed', 'income'] as RecurringGroup[]).map((g) => ({
    g, list: active.filter((r) => groupOf(r) === g).sort((a, b) => a.next_date.localeCompare(b.next_date)),
  }))
  const out = active.filter((r) => r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0)
  const inc = active.filter((r) => r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0)
  const off = items.filter((r) => !r.active)

  const add = async (s: (typeof suggestions)[number]) => {
    haptic('success')
    await insert.mutateAsync({ name: s.name, amount: s.amount, kind: 'expense', frequency: s.cadence, next_date: s.next, account_id: s.accountId, category_id: s.categoryId, match_text: s.key.toLowerCase(), active: true })
    toast(`${s.name} aggiunto`)
  }

  return (
    <div>
      <BackButton label="Piano" fallback="/piano" always />
      <PageHeader title="Spese fisse" subtitle="Abbonamenti, rate ed entrate che si ripetono." right={
        <button onClick={() => setForm('new')} className="btn btn-primary !px-3" aria-label="Aggiungi"><Plus size={20} /></button>
      } />

      {/* Riepilogo: quanto se ne va ogni mese, in automatico */}
      <section className="rounded-[28px] bg-note p-6 text-note-ink">
        <p className="text-sm opacity-75">Ogni mese escono in automatico</p>
        <p className="num mt-1 text-[2.5rem] leading-none font-semibold tracking-[-0.03em]">{money(out)}</p>
        <p className="num mt-2 text-sm opacity-85">{money(out * 12, true)} all'anno{inc > 0 && ` · entrano ${money(inc)} al mese`}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4 text-[0.8rem]">
          {groups.map(({ g, list }) => (
            <div key={g} className="min-w-0">
              <p className="truncate opacity-70">{GROUP_LABEL[g]}</p>
              <p className="num font-semibold">{list.length}</p>
            </div>
          ))}
        </div>
      </section>

      {hikes.length > 0 && (
        <section className="mt-4 space-y-2">
          {hikes.map((s) => {
            // Se è già in elenco con il vecchio prezzo, un tocco lo aggiorna
            const w = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/)[0] ?? ''
            const k = w(s.key)
            const mine = items.find((r) => { const m = w(r.match_text || r.name); return r.active && Math.abs(r.amount - s.amount) > 0.009 && m.length >= 3 && (k.startsWith(m) || m.startsWith(k)) })
            return (
              <div key={s.key} className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
                <TrendingUp size={19} className="shrink-0 text-gold" />
                <p className="min-w-0 flex-1 text-sm"><strong>{s.name}</strong> è aumentato del {percent(s.hike!)}: da {money(s.previous!)} a {money(s.amount)}.</p>
                {mine && <button className="btn btn-ghost shrink-0 !px-3 !py-1.5 text-sm" onClick={async () => { await update.mutateAsync({ id: mine.id, amount: s.amount }); toast('Importo aggiornato') }}>Aggiorna</button>}
              </div>
            )
          })}
        </section>
      )}

      {active.length === 0 && (
        <Empty title="Ancora nessuna spesa fissa" text="Aggiungi abbonamenti, rate e affitto col + in alto, oppure scegli tra quelli trovati qui sotto."
          action={<button onClick={() => setForm('new')} className="btn btn-primary"><Plus size={17} /> Aggiungi</button>} />
      )}

      {groups.map(({ g, list }) => list.length > 0 && (
        <section key={g} className="mt-6">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="font-semibold">{GROUP_LABEL[g]}</h2>
            <span className="num text-sm text-muted">{money(list.reduce((s, r) => s + monthlyEquivalent(r), 0))} al mese</span>
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
            {list.map((r) => <Row key={r.id} r={r} cat={catOf(r.category_id)} onOpen={() => setForm(r)} onRecord={() => record(r)} />)}
          </ul>
        </section>
      ))}

      {suggestions.length > 0 && (
        <section className="mt-8 rounded-3xl border border-dashed border-brand/40 p-4">
          <div className="flex items-start gap-2 px-1">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={17} className="text-brand" /> Trovati nei tuoi movimenti</h2>
              <p className="text-sm text-muted">Addebiti regolari che non sono ancora in elenco. Aggiungili o scartali.</p>
            </div>
            <button className="icon-btn -mt-1 -mr-1 shrink-0" aria-label="Scarta tutti" onClick={() => { ignore(suggestions.map((x) => x.key)); toast('Suggerimenti nascosti') }}><X size={19} /></button>
          </div>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li key={s.key} className="overflow-hidden rounded-2xl">
                <SwipeDismiss label={`Scarta ${s.name}`} onDismiss={() => ignore([s.key])}>
                  {(dismiss) => (
                    <div className="flex items-center gap-2 py-3 pr-3 pl-4">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-muted">{money(s.amount)} · {s.note}</span>
                      </span>
                      <button className="btn btn-ghost !px-3 !py-1.5 text-sm" onClick={() => add(s)}><Plus size={15} /> Aggiungi</button>
                      <DismissX label={`Scarta ${s.name}`} onClick={dismiss} />
                    </div>
                  )}
                </SwipeDismiss>
              </li>
            ))}
          </ul>
        </section>
      )}

      {off.length > 0 && (
        <details className="mt-6 rounded-3xl bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-muted">Disattivati ({off.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {off.map((r) => <Row key={r.id} r={r} cat={catOf(r.category_id)} onOpen={() => setForm(r)} />)}
          </ul>
        </details>
      )}

      {form && <RecurringForm item={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    </div>
  )
}

function Row({ r, cat, onOpen, onRecord }: { r: Recurring; cat?: { icon: string; color: string }; onOpen: () => void; onRecord?: () => void }) {
  const days = differenceInCalendarDays(parseISO(r.next_date), new Date())
  const when = days < 0 ? `scaduto il ${shortDate(r.next_date)}` : days === 0 ? 'oggi' : days === 1 ? 'domani' : days <= 14 ? `tra ${days} giorni` : `il ${shortDate(r.next_date)}`
  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${r.active ? '' : 'opacity-55'}`}>
      <button onClick={onOpen} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
        <Badge icon={cat?.icon ?? 'repeat'} color={cat?.color ?? '#a855f7'} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{r.name}</span>
          <span className={`block truncate text-xs ${days < 0 && r.active ? 'text-neg' : 'text-muted'}`}>{FREQUENCIES[r.frequency].label} · {when}</span>
        </span>
        <span className={`num shrink-0 font-semibold ${r.kind === 'income' ? 'text-pos' : ''}`}>{r.kind === 'income' ? '+' : ''}{money(r.amount)}</span>
      </button>
      {onRecord && r.active && days <= 3 && (
        <button onClick={onRecord} className="btn btn-ghost !px-2.5 !py-1 text-xs" title="Registra il movimento e passa alla prossima scadenza">Registra</button>
      )}
    </li>
  )
}
