import { useMemo, useState } from 'react'
import { TrendingUp, Copy, CalendarClock, Plus, Check } from 'lucide-react'
import { useAccounts, useCategories, useRecurring, useTable, useTransactions } from '../lib/data'
import { detectSubscriptions, duplicates, type Subscription } from '../lib/subscriptions'
import { money, percent, shortDate } from '../lib/format'
import type { Recurring } from '../lib/types'
import { BackButton } from '../components/back'
import { Badge } from '../components/Icon'
import { Empty, PageHeader, Segmented, SkeletonPage, useToast } from '../components/ui'
import { haptic } from '../lib/motion'

const CADENCE = { monthly: 'al mese', yearly: "all'anno", weekly: 'a settimana' } as const

export default function Subscriptions() {
  const { data: txs, isLoading } = useTransactions()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: recurring = [] } = useRecurring()
  const { insert } = useTable<Recurring & Record<string, unknown>>('recurring')
  const toast = useToast()
  const [view, setView] = useState<'active' | 'ended'>('active')
  const subs = useMemo(() => detectSubscriptions(txs ?? [], categories), [txs, categories])
  if (isLoading || !txs) return <SkeletonPage />

  const active = subs.filter((s) => s.active)
  const ended = subs.filter((s) => !s.active)
  const services = active.filter((s) => s.type === 'subscription')
  const fixed = active.filter((s) => s.type === 'fixed')
  const monthly = services.reduce((s, x) => s + x.monthly, 0)
  const fixedMonthly = fixed.reduce((s, x) => s + x.monthly, 0)
  const hikes = active.filter((s) => s.hike)
  const dups = duplicates(subs)
  const cat = (id: string | null) => categories.find((c) => c.id === id)
  const known = (s: Subscription) => recurring.some((r) => (r.match_text || r.name).toUpperCase().includes(s.key.split(' ')[0]))

  const track = async (s: Subscription) => {
    haptic('success')
    await insert.mutateAsync({
      name: s.name, amount: s.amount, kind: 'expense', account_id: s.accounts[0] ?? null, category_id: s.categoryId,
      frequency: s.cadence, next_date: s.next, match_text: s.key.toLowerCase(), active: true,
    })
    toast(`${s.name} aggiunto alle spese ricorrenti: ti avviso prima di ogni addebito`)
  }

  return (
    <div>
      <BackButton label="Piano" fallback="/piano" always />
      <PageHeader title="Abbonamenti" subtitle="Riconosciuti dai tuoi movimenti: addebiti con importo stabile e cadenza regolare." />

      <section className="rounded-[28px] bg-note p-6 text-note-ink">
        <p className="text-sm opacity-75">Spendi in abbonamenti</p>
        <p className="num mt-1 text-[2.6rem] leading-none font-semibold tracking-[-0.03em]">{money(monthly)}<span className="text-lg font-medium opacity-70"> /mese</span></p>
        <p className="num mt-2 opacity-85">{money(monthly * 12, true)} all'anno · {services.length} attivi</p>
        {fixed.length > 0 && <p className="num mt-3 border-t border-white/15 pt-3 text-sm opacity-80">Altre spese fisse (affitto, rate…): {money(fixedMonthly)} al mese</p>}
      </section>

      {(hikes.length > 0 || dups.length > 0) && (
        <section className="mt-5 space-y-2">
          {hikes.map((s) => (
            <div key={s.key} className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
              <TrendingUp size={19} className="mt-0.5 shrink-0 text-gold" />
              <p className="text-sm"><strong>{s.name}</strong> è aumentato del {percent(s.hike!)}: da {money(s.previous!)} a {money(s.amount)}. Sono {money((s.amount - s.previous!) * (s.cadence === 'monthly' ? 12 : 1))} in più all'anno.</p>
            </div>
          ))}
          {dups.map(([a, b]) => (
            <div key={a.key + b.key} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3">
              <Copy size={18} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-sm">Possibile doppione: <strong>{a.name}</strong> e <strong>{b.name}</strong>. Controlla di non pagare due volte lo stesso servizio.</p>
            </div>
          ))}
        </section>
      )}

      <Segmented value={view} onChange={setView} className="mt-6 mb-4" options={[{ value: 'active', label: `Attivi (${active.length})` }, { value: 'ended', label: `Terminati (${ended.length})` }]} />

      {(view === 'active' ? active : ended).length === 0 ? (
        <Empty title={view === 'active' ? 'Nessun abbonamento riconosciuto' : 'Nessun abbonamento terminato'} text="Servono almeno tre addebiti simili dallo stesso esercente." />
      ) : (view === 'active' ? [['Abbonamenti', services], ['Spese fisse', fixed]] as const : [['Terminati', ended]] as const).map(([title, items]) => items.length > 0 && (
        <section key={title} className="mb-6">
          {view === 'active' && <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase">{title}</p>}
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
          {items.map((s) => {
            const c = cat(s.categoryId)
            return (
              <li key={s.key} className="flex items-center gap-3 px-4 py-3.5">
                <Badge icon={c?.icon ?? 'repeat'} color={c?.color ?? '#a855f7'} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted">
                    {s.active ? <><CalendarClock size={12} /> prossimo verso il {shortDate(s.next)}</> : `ultimo il ${shortDate(s.last)}`}
                    {accounts.length > 1 && ` · ${s.accounts.map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean).join(', ')}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num font-semibold">{money(s.amount)}</p>
                  <p className="text-xs text-muted">{CADENCE[s.cadence]}</p>
                </div>
                {s.active && (known(s)
                  ? <span className="ml-1 rounded-full p-1.5 text-pos" title="Già tra le ricorrenti"><Check size={17} /></span>
                  : <button onClick={() => track(s)} className="ml-1 rounded-full bg-sunken p-1.5 text-brand" aria-label={`Segui ${s.name}`} title="Aggiungi alle ricorrenti"><Plus size={17} /></button>)}
              </li>
            )
          })}
        </ul>
        </section>
      ))}
      <p className="mt-4 text-xs text-muted">Con il + l'abbonamento entra tra le spese ricorrenti: compare in "In arrivo" e ricevi la notifica il giorno prima.</p>
    </div>
  )
}
