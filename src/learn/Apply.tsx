import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { subMonths } from 'date-fns'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAccounts, useBalances, useCategories, useRecurring, useTransactions } from '../lib/data'
import { avgMonthlyExpense, cashflow, compound, inMonth, monthlyEquivalent, networth, savingsRate } from '../lib/finance'
import { money, parseAmount, percent } from '../lib/format'
import type { ApplyKey } from './content'
import { Bar } from '../components/ui'

const NEEDS = new Set(['Affitto e casa', 'Bollette', 'Telefono e internet', 'Supermercato', 'Carburante', 'Auto', 'Mezzi pubblici', 'Salute', 'Tasse e commissioni'])

function useLast3() {
  const { data: txs = [] } = useTransactions()
  return useMemo(() => {
    const months = [1, 2, 3].map((i) => inMonth(txs, subMonths(new Date(), i)))
    const filled = months.filter((m) => m.length)
    const use = filled.length ? filled : [inMonth(txs, new Date())]
    const all = use.flat()
    const c = cashflow(all)
    const n = use.length
    return { txs, all, income: c.income / n, expense: c.expense / n, n }
  }, [txs])
}

export function Apply({ k }: { k: ApplyKey }) {
  return (
    <section className="my-8 rounded-3xl border border-brand/25 bg-brand-soft/60 p-5 sm:p-6">
      <h3 className="mb-3 font-semibold">Applicalo ai tuoi numeri</h3>
      {k === 'hours' && <Hours />}
      {k === 'networth' && <Networth />}
      {k === 'savings' && <Savings />}
      {k === 'budget503020' && <Budget503020 />}
      {k === 'emergency' && <Emergency />}
      {k === 'debts' && <Debts />}
      {k === 'subscriptions' && <Subscriptions />}
      {k === 'compound' && <Compound />}
      {k === 'fi' && <FI />}
    </section>
  )
}

function NoData() {
  return <p className="text-sm text-muted">Servono un po' di movimenti per calcolarlo. Registra le spese per qualche settimana o importa l'estratto conto, poi torna qui.</p>
}

function Hours() {
  const [net, setNet] = useState(localStorage.getItem('soldi-net') ?? '')
  const [costs, setCosts] = useState(localStorage.getItem('soldi-workcost') ?? '')
  const [hours, setHours] = useState(localStorage.getItem('soldi-workhours') ?? '170')
  const [price, setPrice] = useState('100')
  const save = (k: string, v: string, set: (v: string) => void) => { set(v); localStorage.setItem(k, v) }
  const rate = ((parseAmount(net) ?? 0) - (parseAmount(costs) ?? 0)) / (parseAmount(hours) || 1)
  const p = parseAmount(price) ?? 0
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Netto al mese" value={net} onChange={(v) => save('soldi-net', v, setNet)} />
        <Field label="Costi per lavorare" value={costs} onChange={(v) => save('soldi-workcost', v, setCosts)} />
        <Field label="Ore al mese, tragitti inclusi" value={hours} onChange={(v) => save('soldi-workhours', v, setHours)} />
      </div>
      {rate > 0 ? (
        <div className="mt-4">
          <p>La tua paga oraria reale è <strong className="num">{money(rate)}</strong>.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span>Una spesa da</span>
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="field num !w-28 !py-1.5" />
            <span>ti costa <strong className="num">{(p / rate).toFixed(1).replace('.', ',')} ore</strong> di vita.</span>
          </div>
        </div>
      ) : <p className="mt-3 text-sm text-muted">Inserisci i tuoi dati: restano solo su questo dispositivo.</p>}
    </div>
  )
}

function Networth() {
  const { data: accounts = [] } = useAccounts()
  const { data: balances } = useBalances()
  const { income, expense, n } = useLast3()
  const nw = networth(accounts, balances)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><p className="text-sm text-muted">Patrimonio netto oggi</p><p className="num text-2xl font-semibold">{money(nw.total)}</p><p className="text-xs text-muted">{money(nw.assets, true)} di attività, {money(nw.debts, true)} di debiti</p></div>
      <div><p className="text-sm text-muted">Flusso di cassa medio mensile</p><p className={`num text-2xl font-semibold ${income - expense < 0 ? 'text-neg' : ''}`}>{money(income - expense)}</p><p className="text-xs text-muted">media su {n} {n === 1 ? 'mese' : 'mesi'}</p></div>
    </div>
  )
}

function Savings() {
  const { income, expense } = useLast3()
  if (!income) return <NoData />
  const rate = savingsRate(income, expense)
  const target10 = income * 0.1, target20 = income * 0.2
  return (
    <div>
      <p>In media risparmi il <strong className="num">{percent(rate)}</strong> di quello che entra.</p>
      <div className="mt-3"><Bar value={Math.max(0, rate)} max={0.3} tone={rate >= 0.2 ? 'gold' : 'brand'} /></div>
      <p className="mt-3 text-sm text-muted">Per arrivare al 10% servono <strong className="num">{money(target10, true)}</strong> al mese, per il 20% <strong className="num">{money(target20, true)}</strong>. Sono le cifre da mettere nel bonifico automatico.</p>
      <Link to="/piano?tab=recurring" className="btn btn-primary mt-4">Imposta il risparmio automatico</Link>
    </div>
  )
}

function Budget503020() {
  const { all, income, n } = useLast3()
  const { data: categories = [] } = useCategories()
  if (!income) return <NoData />
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  let needs = 0, wants = 0
  for (const t of all) if (t.kind === 'expense') { if (NEEDS.has(cat.get(t.category_id ?? '') ?? '')) needs -= t.amount; else wants -= t.amount }
  needs /= n; wants /= n
  const save = income - needs - wants
  const rows = [
    { label: 'Necessità', value: needs, target: 0.5, over: needs / income > 0.5 },
    { label: 'Desideri', value: wants, target: 0.3, over: wants / income > 0.3 },
    { label: 'Risparmio', value: save, target: 0.2, over: save / income < 0.2 },
  ]
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm"><span className="font-medium">{r.label}</span><span className="num"><strong>{percent(r.value / income)}</strong> <span className="text-muted">(obiettivo {percent(r.target)}), {money(r.value, true)} al mese</span></span></div>
          <div className="mt-1.5"><Bar value={Math.max(0, r.value)} max={income} tone={r.over ? 'warn' : 'brand'} /></div>
        </div>
      ))}
      <p className="text-xs text-muted">Calcolato sulla media degli ultimi mesi. Le categorie che contano come necessità: casa, bollette, telefono, supermercato, trasporti, salute, tasse.</p>
    </div>
  )
}

function Emergency() {
  const { data: accounts = [] } = useAccounts()
  const { data: balances } = useBalances()
  const { txs } = useLast3()
  const avg = avgMonthlyExpense(txs, 3)
  const liquid = networth(accounts, balances).liquid
  if (!avg) return <NoData />
  const months = liquid / avg
  return (
    <div>
      <p>La tua liquidità copre <strong className="num">{months.toFixed(1).replace('.', ',')} mesi</strong> di spese medie ({money(avg, true)} al mese).</p>
      <div className="mt-3"><Bar value={months} max={6} tone={months >= 6 ? 'gold' : months >= 3 ? 'brand' : 'warn'} /></div>
      <p className="mt-2 text-sm text-muted">Obiettivo tra 3 mesi ({money(avg * 3, true)}) e 6 mesi ({money(avg * 6, true)}). Considera che la liquidità include anche i soldi per le spese di tutti i giorni.</p>
      <Link to="/piano?tab=goals" className="btn btn-primary mt-4">Crea l'obiettivo</Link>
    </div>
  )
}

function Debts() {
  const { data: accounts = [] } = useAccounts()
  const { data: balances } = useBalances()
  const debts = accounts.filter((a) => !a.archived && (balances?.get(a.id)?.balance ?? 0) < 0)
  if (!debts.length) return <p>Non risultano debiti sui tuoi conti. Ottimo: tienili così.</p>
  return (
    <ul className="space-y-2">
      {debts.map((a) => <li key={a.id} className="flex justify-between"><span>{a.name}</span><strong className="num">{money(-(balances?.get(a.id)?.balance ?? 0))}</strong></li>)}
    </ul>
  )
}

function Subscriptions() {
  const { data: rec = [] } = useRecurring()
  const subs = rec.filter((r) => r.active && r.kind === 'expense')
  if (!subs.length) return (
    <div><p className="text-sm text-muted">Non hai ancora aggiunto spese ricorrenti.</p><Link to="/piano?tab=recurring" className="btn btn-primary mt-3">Aggiungile ora</Link></div>
  )
  const monthly = subs.reduce((s, r) => s + monthlyEquivalent(r), 0)
  return (
    <div>
      <p>Le tue spese ricorrenti valgono <strong className="num">{money(monthly)}</strong> al mese, cioè <strong className="num">{money(monthly * 12, true)}</strong> all'anno.</p>
      <ul className="mt-3 space-y-1 text-sm">
        {subs.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)).slice(0, 6).map((r) => (
          <li key={r.id} className="flex justify-between"><span>{r.name}</span><span className="num text-muted">{money(monthlyEquivalent(r) * 12, true)} l'anno</span></li>
        ))}
      </ul>
    </div>
  )
}

function Compound() {
  const [monthly, setMonthly] = useState('150')
  const [years, setYears] = useState('30')
  const [rate, setRate] = useState('6')
  const series = compound(parseAmount(monthly) ?? 0, Math.min(60, Math.max(1, parseAmount(years) ?? 1)), (parseAmount(rate) ?? 0) / 100)
  const last = series[series.length - 1]
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Al mese (€)" value={monthly} onChange={setMonthly} />
        <Field label="Anni" value={years} onChange={setYears} />
        <Field label="Rendimento annuo %" value={rate} onChange={setRate} />
      </div>
      <p className="mt-4">Versi <strong className="num">{money(last.invested, true)}</strong> e arrivi a circa <strong className="num">{money(last.value, true)}</strong>. Interessi composti: <strong className="num">{money(last.value - last.invested, true)}</strong>.</p>
      <div className="mt-3 h-48" role="img" aria-label="Crescita del capitale nel tempo">
        <ResponsiveContainer>
          <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis hide />
            <Tooltip content={({ active, payload }) => active && payload?.length ? (
              <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
                <div className="text-xs text-muted">Anno {(payload[0].payload as { year: number }).year}</div>
                <div className="num font-semibold">{money((payload[0].payload as { value: number }).value, true)}</div>
                <div className="num text-xs text-muted">versati {money((payload[0].payload as { invested: number }).invested, true)}</div>
              </div>) : null} />
            <Area dataKey="value" stroke="var(--c-in)" strokeWidth={2} fill="var(--c-in)" fillOpacity={0.15} isAnimationActive={false} />
            <Area dataKey="invested" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted">Linea continua: valore stimato. Tratteggio: quanto hai versato. Rendimento costante ipotetico, al lordo di tasse e costi.</p>
    </div>
  )
}

function FI() {
  const { income, expense } = useLast3()
  const [extra, setExtra] = useState(0)
  if (!income) return <NoData />
  const s = Math.min(0.9, Math.max(0.01, savingsRate(income, expense) + extra / 100))
  const r = 0.05
  const years = Math.log(1 + (25 * (1 - s) * r) / s) / Math.log(1 + r)
  const target = (1 - s) * income * 12 * 25
  return (
    <div>
      <p>Con un tasso di risparmio del <strong className="num">{percent(s)}</strong>, partendo da zero e con un rendimento reale ipotetico del 5%, servirebbero circa <strong className="num">{Math.round(years)} anni</strong> per arrivare a 25 volte la spesa annua (circa {money(target, true)}).</p>
      <label className="mt-4 block text-sm">
        <span className="text-muted">Se risparmiassi il {extra}% in più</span>
        <input type="range" min={0} max={30} value={extra} onChange={(e) => setExtra(+e.target.value)} className="mt-2 w-full accent-[var(--brand)]" />
      </label>
      <p className="mt-2 text-xs text-muted">Stima indicativa: non considera il patrimonio che hai già, tasse, costi e variazioni di reddito.</p>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="field num !bg-surface !py-2" />
    </label>
  )
}
