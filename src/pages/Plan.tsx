import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Plus, Wand2, Check, Pencil, Sparkles, Repeat, ChevronRight } from 'lucide-react'
import { Link } from '../components/nav'
import { recurringGroup } from '../lib/subscriptions'
import { useAccounts, useBalances, useBudgets, useCategories, useGoals, useRecurring, useTable, useTransactions } from '../lib/data'
import { avgMonthlyExpense, inMonth, monthlyEquivalent, monthsLeft, spendByCategory } from '../lib/finance'
import { money, parseAmount, round2, longDate, percent } from '../lib/format'
import type { Budget, BudgetKind, Goal } from '../lib/types'
import { Badge, COLORS, ICON_NAMES, Icon } from '../components/Icon'
import { Bar, Empty, Label, PageHeader, Segmented, Sheet, SkeletonRows, useToast } from '../components/ui'

type Tab = 'budget' | 'goals'

export default function Plan() {
  // La scheda resta montata anche quando sei altrove: la sezione interna è uno stato locale,
  // che un link come /piano?tab=recurring può impostare
  const [sp] = useSearchParams()
  const { pathname } = useLocation()
  const param = sp.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(param === 'goals' ? 'goals' : 'budget')
  const want = pathname === '/piano' && (param === 'goals' || param === 'budget') ? param : null
  useEffect(() => { if (want) setTab(want) }, [want])
  return (
    <div>
      <PageHeader title="Piano" subtitle="Decidi prima dove vanno i soldi, poi controlla." />
      <SubscriptionsCard />
      <Segmented value={tab} onChange={setTab} className="mb-6"
        options={[{ value: 'budget', label: 'Budget' }, { value: 'goals', label: 'Obiettivi' }]} />
      <div key={tab} className="fade-in">
        {tab === 'budget' && <BudgetTab />}
        {tab === 'goals' && <GoalsTab />}
      </div>
    </div>
  )
}

function SubscriptionsCard() {
  const { data: items = [] } = useRecurring()
  const { data: categories = [] } = useCategories()
  const active = items.filter((r) => r.active)
  const subs = active.filter((r) => recurringGroup(r, categories.find((c) => c.id === r.category_id)?.name) === 'subscription').length
  const fixed = active.filter((r) => r.kind === 'expense').length - subs
  const monthly = active.filter((r) => r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0)
  return (
    <Link to="/abbonamenti" className="press mb-5 flex items-center gap-3.5 rounded-3xl bg-surface px-4 py-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#a855f7]/15 text-[#a855f7]"><Repeat size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Abbonamenti e spese fisse</span>
        <span className="block truncate text-sm text-muted">
          {active.length ? `${money(monthly)} al mese · ${subs} ${subs === 1 ? 'abbonamento' : 'abbonamenti'}, ${fixed} altre` : 'Aggiungi Netflix, telefono, rate, affitto'}
        </span>
      </span>
      <ChevronRight size={18} className="text-faint" />
    </Link>
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
  const [kind, setKind] = useState<BudgetKind>('fixed')

  const spent = useMemo(() => spendByCategory(inMonth(txs, new Date())), [txs])
  // Budget annuali: conta la spesa da inizio anno
  const spentYear = useMemo(() => {
    const y = String(new Date().getFullYear())
    return spendByCategory(txs.filter((t) => t.date.startsWith(y)))
  }, [txs])
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
  const monthlyOf = (b: Budget) => (b.kind === 'annual' ? b.amount / 12 : b.amount)
  const totalBudget = budgets.reduce((s, b) => s + monthlyOf(b), 0)
  const totalSpentBudgeted = budgets.reduce((s, b) => s + (spent.get(b.category_id) ?? 0), 0)
  const flex = budgets.filter((b) => b.kind === 'flex')
  const flexBudget = flex.reduce((s, b) => s + b.amount, 0)
  const flexSpent = flex.reduce((s, b) => s + (spent.get(b.category_id) ?? 0), 0)
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const monthProgress = today.getDate() / daysInMonth

  const saveBudget = async (catId: string) => {
    const n = parseAmount(val)
    const existing = budgets.find((b) => b.category_id === catId)
    if (n === null || n <= 0) { if (existing) await remove.mutateAsync(existing.id) }
    else await upsert.mutateAsync({ rows: { category_id: catId, amount: round2(n), kind }, onConflict: 'user_id,category_id' })
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">Speso questo mese</p>
            <p className="num mt-1 text-3xl font-semibold tracking-[-0.02em]">{money(totalSpentBudgeted)} <span className="text-lg font-normal text-muted">di {money(totalBudget, true)}</span></p>
          </div>
          <button onClick={suggest} className="icon-btn shrink-0 !bg-sunken text-brand" aria-label="Suggerisci i budget dai miei dati" title="Suggerisci dai miei dati"><Wand2 size={19} /></button>
        </div>
        <div className="relative mt-4">
          <Bar value={totalSpentBudgeted} max={totalBudget} tone={totalSpentBudgeted > totalBudget ? 'neg' : totalSpentBudgeted / (totalBudget || 1) > monthProgress + 0.1 ? 'warn' : 'brand'} />
          <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink/50" style={{ left: `${monthProgress * 100}%` }} title="Oggi" />
        </div>
        <p className="mt-2 text-xs text-muted">La tacca è oggi: se la barra la supera stai spendendo troppo in fretta.</p>
        {flex.length > 0 && (
          <div className="mt-5 rounded-2xl bg-sunken p-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Spese flessibili <span className="font-normal text-muted">({flex.length} categorie)</span></span>
              <span className="num"><strong>{money(flexSpent, true)}</strong> <span className="text-muted">/ {money(flexBudget, true)}</span></span>
            </div>
            <div className="mt-2"><Bar value={flexSpent} max={flexBudget} thin tone={flexSpent > flexBudget ? 'neg' : flexSpent > flexBudget * monthProgress + 0.1 * flexBudget ? 'warn' : 'brand'} /></div>
            <p className="mt-1.5 text-xs text-muted">Conta solo il totale di queste categorie.</p>
          </div>
        )}
      </section>

      <div className="mt-8 space-y-8">
        {groups.map((g, gi) => (
          <section key={g} className="rise" style={{ '--i': gi } as React.CSSProperties}>
            <h3 className="mb-2 px-1 text-sm font-semibold text-muted">{g}</h3>
            <ul className="divide-y divide-line rounded-3xl bg-surface">
              {exp.filter((c) => (c.group_name ?? 'Altro') === g).map((c) => {
                const b = budgets.find((x) => x.category_id === c.id)
                const s = b?.kind === 'annual' ? spentYear.get(c.id) ?? 0 : spent.get(c.id) ?? 0
                const a = avg.get(c.id)
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                    <Badge icon={c.icon} color={c.color} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{c.name}</span>
                        {editing === c.id ? (
                          <span className="flex flex-wrap items-center justify-end gap-1">
                            <select value={kind} onChange={(e) => setKind(e.target.value as BudgetKind)} className="field !w-auto !py-1 text-xs" aria-label="Tipo di budget">
                              <option value="fixed">Fisso / mese</option>
                              <option value="flex">Flessibile / mese</option>
                              <option value="annual">Annuale</option>
                            </select>
                            <input autoFocus inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(c.id); if (e.key === 'Escape') setEditing(null) }}
                              className="field num !w-24 !py-1 text-right" placeholder={a ? String(Math.ceil(a / 10) * 10) : '0'} />
                            <button onClick={() => saveBudget(c.id)} className="rounded-full p-1.5 text-brand hover:bg-sunken" aria-label="Salva"><Check size={18} /></button>
                          </span>
                        ) : (
                          <button onClick={() => { setEditing(c.id); setKind(b?.kind ?? 'fixed'); setVal(b ? String(b.amount).replace('.', ',') : '') }} className="num shrink-0 text-sm hover:underline">
                            <span className="font-semibold">{money(s)}</span>
                            <span className="text-muted"> / {b ? money(b.amount, true) : 'imposta'}</span>
                            {b?.kind === 'annual' && <span className="ml-1 rounded-full bg-gold/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-gold">ANNO</span>}
                            {b?.kind === 'flex' && <span className="ml-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[0.65rem] font-semibold text-brand">FLEX</span>}
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

  // Movimenti collegati all'obiettivo (pressione lunga su un movimento → Collega a un obiettivo)
  const linked = (g: Goal) => txs.filter((t) => t.goal_id === g.id).reduce((s, t) => s + Math.abs(t.amount), 0)
  const progressOf = (g: Goal) => (g.account_id ? Math.max(0, balances?.get(g.account_id)?.balance ?? 0) : g.saved_amount) + linked(g)

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
                  {linked(g) > 0 && <p className="text-xs text-muted">Di cui {money(linked(g), true)} da movimenti collegati.</p>}
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
      <input inputMode="decimal" className="field num text-2xl" placeholder="0,00" value={v} onChange={(e) => setV(e.target.value)} />
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
