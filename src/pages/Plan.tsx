import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Wand2, Check, Pencil, Sparkles } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useAccounts, useBalances, useBudgets, useCategories, useGoals, useRecurring, useTable, useTransactions, useInvalidate } from '../lib/data'
import { advance, avgMonthlyExpense, detectRecurring, inMonth, monthlyEquivalent, monthsLeft, spendByCategory, cashflow } from '../lib/finance'
import { money, parseAmount, round2, shortDate, longDate, todayISO, percent } from '../lib/format'
import { FREQUENCIES, type Budget, type Frequency, type Goal, type Recurring } from '../lib/types'
import { supabase } from '../lib/supabase'
import { Badge, COLORS, ICON_NAMES, Icon } from '../components/Icon'
import { Bar, Empty, Label, Money, PageHeader, Segmented, Sheet, SkeletonRows, useToast } from '../components/ui'

type Tab = 'budget' | 'goals' | 'recurring'

export default function Plan() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'budget'
  return (
    <div>
      <PageHeader title="Piano" subtitle="Decidi prima dove vanno i soldi, poi controlla." />
      <Segmented value={tab} onChange={(t) => setSp({ tab: t })} className="mb-6"
        options={[{ value: 'budget', label: 'Budget' }, { value: 'goals', label: 'Obiettivi' }, { value: 'recurring', label: 'Ricorrenti' }]} />
      <div key={tab} className="page-enter">
        {tab === 'budget' && <BudgetTab />}
        {tab === 'goals' && <GoalsTab />}
        {tab === 'recurring' && <RecurringTab />}
      </div>
    </div>
  )
}

/* ================= BUDGET ================= */
function BudgetTab() {
  const { data: categories, isLoading } = useCategories()
  const { data: budgets = [] } = useBudgets()
  const { data: txs = [] } = useTransactions()
  const { upsert, remove } = useTable<Budget & Record<string, unknown>>('budgets')
  const toast = useToast()
  const [editing, setEditing] = useState<string | null>(null)
  const [val, setVal] = useState('')

  const spent = useMemo(() => spendByCategory(inMonth(txs, new Date())), [txs])
  const avg = useMemo(() => {
    const m = new Map<string, number>()
    for (let i = 1; i <= 3; i++) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      spendByCategory(inMonth(txs, d)).forEach((v, k) => k && m.set(k, (m.get(k) ?? 0) + v / 3))
    }
    return m
  }, [txs])

  if (isLoading || !categories) return <SkeletonRows />
  const exp = categories.filter((c) => c.kind === 'expense' && !c.archived)
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpentBudgeted = budgets.reduce((s, b) => s + (spent.get(b.category_id) ?? 0), 0)
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const monthProgress = today.getDate() / daysInMonth

  const saveBudget = async (catId: string) => {
    const n = parseAmount(val)
    const existing = budgets.find((b) => b.category_id === catId)
    if (n === null || n <= 0) { if (existing) await remove.mutateAsync(existing.id) }
    else await upsert.mutateAsync({ rows: { category_id: catId, amount: round2(n) }, onConflict: 'user_id,category_id' })
    setEditing(null)
  }

  const suggest = async () => {
    const rows = exp.flatMap((c) => {
      const a = avg.get(c.id)
      return a && a > 5 ? [{ category_id: c.id, amount: Math.ceil(a / 10) * 10 }] : []
    })
    if (!rows.length) return toast('Servono almeno un paio di mesi di movimenti per suggerire i budget.', { tone: 'err' })
    await upsert.mutateAsync({ rows, onConflict: 'user_id,category_id' })
    toast(`Budget suggeriti per ${rows.length} categorie, in base alla media degli ultimi 3 mesi`)
  }

  const groups = [...new Set(exp.map((c) => c.group_name ?? 'Altro'))]

  return (
    <div>
      <section className="rounded-3xl bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Speso sulle categorie con budget</p>
            <p className="num mt-1 text-3xl font-semibold tracking-[-0.02em]">{money(totalSpentBudgeted)} <span className="text-lg font-normal text-muted">di {money(totalBudget, true)}</span></p>
          </div>
          <button onClick={suggest} className="btn btn-ghost"><Wand2 size={17} /> Suggerisci dai miei dati</button>
        </div>
        <div className="relative mt-4">
          <Bar value={totalSpentBudgeted} max={totalBudget} tone={totalSpentBudgeted > totalBudget ? 'neg' : totalSpentBudgeted / (totalBudget || 1) > monthProgress + 0.1 ? 'warn' : 'brand'} />
          <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink/50" style={{ left: `${monthProgress * 100}%` }} title="Oggi" />
        </div>
        <p className="mt-2 text-xs text-muted">La tacca indica a che punto del mese sei. Se la barra la supera, stai spendendo più in fretta del previsto.</p>
      </section>

      <div className="mt-8 space-y-8">
        {groups.map((g, gi) => (
          <section key={g} className="rise" style={{ '--i': gi } as React.CSSProperties}>
            <h3 className="mb-2 px-1 text-sm font-semibold text-muted">{g}</h3>
            <ul className="divide-y divide-line rounded-3xl bg-surface">
              {exp.filter((c) => (c.group_name ?? 'Altro') === g).map((c) => {
                const b = budgets.find((x) => x.category_id === c.id)
                const s = spent.get(c.id) ?? 0
                const a = avg.get(c.id)
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                    <Badge icon={c.icon} color={c.color} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{c.name}</span>
                        {editing === c.id ? (
                          <span className="flex items-center gap-1">
                            <input autoFocus inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(c.id); if (e.key === 'Escape') setEditing(null) }}
                              className="field num !w-24 !py-1 text-right" placeholder={a ? String(Math.ceil(a / 10) * 10) : '0'} />
                            <button onClick={() => saveBudget(c.id)} className="rounded-full p-1.5 text-brand hover:bg-sunken" aria-label="Salva"><Check size={18} /></button>
                          </span>
                        ) : (
                          <button onClick={() => { setEditing(c.id); setVal(b ? String(b.amount).replace('.', ',') : '') }} className="num shrink-0 text-sm hover:underline">
                            <span className="font-semibold">{money(s)}</span>
                            <span className="text-muted"> / {b ? money(b.amount, true) : 'imposta'}</span>
                          </button>
                        )}
                      </div>
                      {b ? (
                        <div className="mt-2"><Bar value={s} max={b.amount} thin tone={s > b.amount ? 'neg' : s > b.amount * 0.8 ? 'warn' : 'brand'} /></div>
                      ) : a ? <p className="mt-0.5 text-xs text-muted">Media ultimi 3 mesi: {money(a, true)}</p> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

/* ================= OBIETTIVI ================= */
function GoalsTab() {
  const { data: goals, isLoading } = useGoals()
  const { data: balances } = useBalances()
  const { data: txs = [] } = useTransactions()
  const { update } = useTable<Goal & Record<string, unknown>>('goals')
  const toast = useToast()
  const [form, setForm] = useState<Goal | 'new' | null>(null)
  const [adding, setAdding] = useState<Goal | null>(null)
  if (isLoading || !goals) return <SkeletonRows n={3} />
  const active = goals.filter((g) => !g.archived)
  const emergency = round2(avgMonthlyExpense(txs, 3) * 6)

  const progressOf = (g: Goal) => (g.account_id ? Math.max(0, balances?.get(g.account_id)?.balance ?? 0) : g.saved_amount)

  return (
    <div>
      <div className="mb-6 flex justify-end"><button onClick={() => setForm('new')} className="btn btn-primary"><Plus size={18} /> Obiettivo</button></div>
      {active.length === 0 ? (
        <Empty title="Nessun obiettivo ancora" text={emergency > 0 ? `Un buon primo obiettivo è il fondo emergenza: 6 mesi di spese, per te circa ${money(emergency, true)}.` : 'Un buon primo obiettivo è il fondo emergenza: da 3 a 6 mesi di spese.'}
          action={<button onClick={() => setForm('new')} className="btn btn-primary">Crea il primo obiettivo</button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {active.map((g, gi) => {
            const saved = progressOf(g)
            const left = Math.max(0, g.target_amount - saved)
            const ml = monthsLeft(g.target_date)
            const done = saved >= g.target_amount
            return (
              <article key={g.id} className="rise rounded-3xl bg-surface p-5" style={{ '--i': gi } as React.CSSProperties}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge icon={g.icon} color={g.color} size={44} />
                    <div>
                      <h3 className="font-semibold">{g.name}</h3>
                      <p className="text-sm text-muted">{g.target_date ? `Entro il ${longDate(g.target_date)}` : 'Senza scadenza'}</p>
                    </div>
                  </div>
                  <button onClick={() => setForm(g)} className="rounded-full p-2 text-muted hover:bg-sunken" aria-label="Modifica"><Pencil size={16} /></button>
                </div>
                <p className="num mt-5 text-2xl font-semibold">{money(saved, true)} <span className="text-base font-normal text-muted">di {money(g.target_amount, true)}</span></p>
                <div className="mt-2"><Bar value={saved} max={g.target_amount} tone={done ? 'gold' : 'brand'} /></div>
                <p className="mt-3 text-sm text-muted">
                  {done ? 'Obiettivo raggiunto. Ottimo lavoro.' : ml ? `Ti servono ${money(left / ml, true)} al mese per ${ml} ${ml === 1 ? 'mese' : 'mesi'}.` : `Mancano ${money(left, true)} (${percent(saved / g.target_amount)} fatto).`}
                </p>
                <div className="mt-4 flex gap-2">
                  {!g.account_id && !done && <button onClick={() => setAdding(g)} className="btn btn-ghost flex-1"><Plus size={16} /> Aggiungi</button>}
                  {done && <button onClick={async () => { await update.mutateAsync({ id: g.id, archived: true }); toast('Obiettivo archiviato') }} className="btn btn-ghost flex-1">Archivia</button>}
                  {g.account_id && <p className="text-xs text-muted">Avanza da solo con il saldo del conto collegato.</p>}
                </div>
              </article>
            )
          })}
        </div>
      )}
      {form && <GoalForm goal={form === 'new' ? undefined : form} suggested={emergency} onClose={() => setForm(null)} />}
      {adding && <Contribute goal={adding} onClose={() => setAdding(null)} />}
    </div>
  )
}

function Contribute({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { update } = useTable<Goal & Record<string, unknown>>('goals')
  const toast = useToast()
  const [v, setV] = useState('')
  return (
    <Sheet open onClose={onClose} title={`Aggiungi a ${goal.name}`}>
      <input autoFocus inputMode="decimal" className="field num text-2xl" placeholder="0,00" value={v} onChange={(e) => setV(e.target.value)} />
      <p className="mt-2 text-sm text-muted">Usa un numero negativo per togliere.</p>
      <button className="btn btn-primary mt-5 w-full py-3.5" onClick={async () => {
        const n = parseAmount(v); if (n === null) return
        await update.mutateAsync({ id: goal.id, saved_amount: round2(goal.saved_amount + n) })
        toast(`${money(n)} aggiunti a ${goal.name}`); onClose()
      }}>Aggiungi</button>
    </Sheet>
  )
}

function GoalForm({ goal, suggested, onClose }: { goal?: Goal; suggested: number; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const { insert, update, remove } = useTable<Goal & Record<string, unknown>>('goals')
  const toast = useToast()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.target_amount).replace('.', ',') : '')
  const [date, setDate] = useState(goal?.target_date ?? '')
  const [accountId, setAccountId] = useState(goal?.account_id ?? '')
  const [saved, setSaved] = useState(goal ? String(goal.saved_amount).replace('.', ',') : '')
  const [icon, setIcon] = useState(goal?.icon ?? 'target')
  const [color, setColor] = useState(goal?.color ?? '#10b981')
  const save = async () => {
    const t = parseAmount(target)
    if (!name.trim() || !t || t <= 0) return
    const row = { name: name.trim(), target_amount: round2(t), target_date: date || null, account_id: accountId || null, saved_amount: round2(parseAmount(saved) ?? 0), icon, color }
    if (goal) await update.mutateAsync({ id: goal.id, ...row })
    else await insert.mutateAsync(row)
    toast(goal ? 'Obiettivo aggiornato' : 'Obiettivo creato'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={goal ? 'Modifica obiettivo' : 'Nuovo obiettivo'}>
      <div className="space-y-4">
        {!goal && suggested > 0 && (
          <button onClick={() => { setName('Fondo emergenza'); setTarget(String(Math.ceil(suggested / 100) * 100)); setIcon('shield'); setColor('#0f4d3a') }}
            className="flex w-full items-center gap-3 rounded-2xl bg-brand-soft p-3 text-left text-sm">
            <Sparkles size={18} className="shrink-0" /> <span>Usa il <strong>fondo emergenza</strong>: 6 mesi delle tue spese medie, circa {money(suggested, true)}.</span>
          </button>
        )}
        <label className="block"><Label>Nome</Label><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Viaggio in Giappone" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><Label>Obiettivo</Label><input className="field num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" /></label>
          <label className="block"><Label>Entro il</Label><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label className="block">
          <Label>Come si misura</Label>
          <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Aggiungo io i versamenti</option>
            {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>Saldo del conto {a.name}</option>)}
          </select>
        </label>
        {!accountId && <label className="block"><Label>Già messo da parte</Label><input className="field num" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0,00" /></label>}
        <div>
          <Label>Icona e colore</Label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_NAMES.slice(0, 32).map((i) => (
              <button key={i} onClick={() => setIcon(i)} aria-label={i} className={`flex h-9 w-9 items-center justify-center rounded-full ${icon === i ? 'bg-ink text-paper' : 'bg-sunken'}`}><Icon name={i} size={16} /></button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={`Colore ${c}`} className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`} style={{ background: c }} />)}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          {goal && <button className="btn btn-danger" onClick={async () => { await remove.mutateAsync(goal.id); toast('Obiettivo eliminato'); onClose() }}>Elimina</button>}
          <button className="btn btn-primary flex-1 py-3.5" onClick={save}>{goal ? 'Salva' : 'Crea obiettivo'}</button>
        </div>
      </div>
    </Sheet>
  )
}

/* ================= RICORRENTI ================= */
function RecurringTab() {
  const { data: items, isLoading } = useRecurring()
  const { data: txs = [] } = useTransactions()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { insert } = useTable<Recurring & Record<string, unknown>>('recurring')
  const invalidate = useInvalidate()
  const toast = useToast()
  const [form, setForm] = useState<Recurring | 'new' | null>(null)
  const suggestions = useMemo(() => detectRecurring(txs, items ?? []), [txs, items])
  if (isLoading || !items) return <SkeletonRows />
  const active = items.filter((r) => r.active)
  const monthlyOut = active.filter((r) => r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0)
  const monthlyIn = active.filter((r) => r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0)
  const income = cashflow(inMonth(txs, new Date())).income
  const catMap = new Map(categories.map((c) => [c.id, c]))

  const record = async (r: Recurring) => {
    const { error } = await supabase.from('transactions').insert({
      account_id: r.account_id ?? accounts.find((a) => !a.archived)?.id, date: r.next_date <= todayISO() ? r.next_date : todayISO(),
      amount: r.kind === 'expense' ? -r.amount : r.amount, kind: r.kind, description: r.name, category_id: r.category_id, recurring_id: r.id,
    })
    if (error) return toast(`Non riuscito: ${error.message}`, { tone: 'err' })
    await supabase.from('recurring').update({ next_date: advance(r.next_date, r.frequency) }).eq('id', r.id)
    invalidate('transactions', 'recurring')
    toast(`${r.name} registrato, prossimo il ${shortDate(advance(r.next_date, r.frequency))}`)
  }

  return (
    <div>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 rounded-3xl bg-surface p-5 sm:col-span-1">
          <p className="text-sm text-muted">Spese fisse al mese</p>
          <p className="num mt-1 text-2xl font-semibold">{money(monthlyOut)}</p>
          {income > 0 && <p className="mt-0.5 text-xs text-muted">{percent(monthlyOut / income)} delle entrate di questo mese</p>}
        </div>
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted">All'anno</p>
          <p className="num mt-1 text-2xl font-semibold">{money(monthlyOut * 12, true)}</p>
        </div>
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted">Entrate fisse al mese</p>
          <p className="num mt-1 text-2xl font-semibold">{money(monthlyIn)}</p>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="mt-6 rounded-3xl border border-dashed border-brand/40 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><Sparkles size={17} /> Sembrano ricorrenti</h3>
          <p className="text-sm text-muted">Li ho trovati nei tuoi movimenti in almeno 3 mesi diversi.</p>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                <span><span className="font-medium">{s.name}</span><span className="block text-sm text-muted">{money(s.amount)} per {s.months} mesi</span></span>
                <button className="btn btn-ghost !py-1.5" onClick={async () => {
                  await insert.mutateAsync({ name: s.name, amount: s.amount, kind: 'expense', frequency: 'monthly', account_id: s.last.account_id, category_id: s.last.category_id, next_date: advance(s.last.date, 'monthly'), match_text: s.key })
                  toast(`${s.name} aggiunto ai ricorrenti`)
                }}><Plus size={16} /> Aggiungi</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Abbonamenti e spese fisse</h3>
        <button onClick={() => setForm('new')} className="btn btn-primary"><Plus size={18} /> Ricorrente</button>
      </div>
      {items.length === 0 ? (
        <Empty title="Nessuna spesa ricorrente" text="Aggiungi affitto, telefono, palestra, Netflix: vedrai quanto ti costano davvero in un anno." />
      ) : (
        <ul className="divide-y divide-line rounded-3xl bg-surface">
          {items.map((r) => {
            const c = r.category_id ? catMap.get(r.category_id) : undefined
            const days = differenceInCalendarDays(parseISO(r.next_date), new Date())
            return (
              <li key={r.id} className={`flex items-center gap-3 px-4 py-3.5 ${r.active ? '' : 'opacity-50'}`}>
                <Badge icon={c?.icon ?? 'repeat'} color={c?.color ?? '#0ea5e9'} size={38} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setForm(r)}>
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block text-sm text-muted">
                    {FREQUENCIES[r.frequency].label}, {days < 0 ? `scaduto il ${shortDate(r.next_date)}` : days === 0 ? 'oggi' : `tra ${days} ${days === 1 ? 'giorno' : 'giorni'}`}
                  </span>
                </button>
                <Money value={r.kind === 'expense' ? -r.amount : r.amount} signed className="font-semibold" />
                {r.active && days <= 3 && (
                  <button onClick={() => record(r)} className="btn btn-ghost !px-3 !py-1.5 text-sm" title="Registra il movimento e passa alla prossima scadenza">Registra</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {form && <RecurringForm item={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    </div>
  )
}

function RecurringForm({ item, onClose }: { item?: Recurring; onClose: () => void }) {
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
    toast(item ? 'Ricorrente aggiornato' : 'Ricorrente aggiunto'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={item ? 'Modifica ricorrente' : 'Nuovo ricorrente'}>
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Uscita' }, { value: 'income', label: 'Entrata' }]} />
        <label className="block"><Label>Nome</Label><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Spotify" autoFocus /></label>
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
            <span className="font-medium">Attivo</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />
          </label>
        )}
        <div className="flex gap-3 pt-2">
          {item && <button className="btn btn-danger" onClick={async () => { await remove.mutateAsync(item.id); toast('Ricorrente eliminato'); onClose() }}>Elimina</button>}
          <button className="btn btn-primary flex-1 py-3.5" onClick={save}>{item ? 'Salva' : 'Aggiungi'}</button>
        </div>
      </div>
    </Sheet>
  )
}
