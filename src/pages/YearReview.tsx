import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { X, Share } from 'lucide-react'
import { useAccounts, useCategories, useSnapshots, useTransactions } from '../lib/data'
import { balanceAt, cashflow, merchantKey, titleCase } from '../lib/finance'
import { detectSubscriptions } from '../lib/subscriptions'
import { money, percent, round2 } from '../lib/format'
import { haptic } from '../lib/motion'
import { useBack } from '../components/back'
import { Badge } from '../components/Icon'
import { useCountUp } from '../components/ui'
import { Guilloche } from '../components/Guilloche'

type Slide = { bg: string; ink?: string; body: ReactNode; share?: string }
const DURATION = 6000

/** "Il tuo anno": una storia a schermo intero, si tocca a destra per andare avanti e a sinistra per tornare. */
export default function YearReview() {
  const back = useBack()
  const { data: txs = [] } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: snaps = [] } = useSnapshots()
  const { data: categories = [] } = useCategories()
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const slides = useMemo<Slide[]>(() => {
    const y = String(year)
    const list = txs.filter((t) => t.date.startsWith(y))
    if (!list.length) return [{ bg: '#0f4d3a', body: <Big title={`Il tuo ${y}`} text="Non ci sono ancora movimenti per quest'anno." /> }]
    const flow = cashflow(list)
    const act = accounts.filter((a) => !a.archived && a.include_in_networth)
    const firstDay = list[list.length - 1].date
    const lastDay = list[0].date
    const nwStart = round2(act.reduce((s, a) => s + balanceAt(a, firstDay, txs, snaps), 0))
    const nwEnd = round2(act.reduce((s, a) => s + balanceAt(a, lastDay, txs, snaps), 0))
    const byCat = new Map<string, number>()
    for (const t of list) if (t.kind === 'expense' && t.category_id) byCat.set(t.category_id, (byCat.get(t.category_id) ?? 0) - t.amount)
    const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
    const cat = topCat && categories.find((c) => c.id === topCat[0])
    const visits = new Map<string, { n: number; total: number }>()
    for (const t of list) if (t.kind === 'expense') { const k = merchantKey(t.description); const v = visits.get(k) ?? { n: 0, total: 0 }; v.n++; v.total -= t.amount; visits.set(k, v) }
    const fav = [...visits.entries()].sort((a, b) => b[1].n - a[1].n)[0]
    const months = new Map<string, number>()
    for (const t of list) if (t.kind !== 'transfer') months.set(t.date.slice(0, 7), (months.get(t.date.slice(0, 7)) ?? 0) + t.amount)
    const bestMonth = [...months.entries()].sort((a, b) => b[1] - a[1])[0]
    const days = new Map<string, number>()
    for (const t of list) if (t.kind === 'expense') days.set(t.date, (days.get(t.date) ?? 0) - t.amount)
    const bigDay = [...days.entries()].sort((a, b) => b[1] - a[1])[0]
    const subs = detectSubscriptions(txs, categories).filter((s) => s.active && s.type === 'subscription')
    const subYear = subs.reduce((s, x) => s + x.yearly, 0)
    const rate = flow.income > 0 ? flow.net / flow.income : 0
    const out: Slide[] = [
      { bg: 'linear-gradient(160deg,#0f4d3a,#06261d)', body: <Big kicker="Soldi presenta" title={`Il tuo ${y}`} text="Dodici mesi di numeri, raccontati in un minuto." /> },
      { bg: 'linear-gradient(160deg,#13573f,#0b3326)', body: <Amount kicker="Il patrimonio è passato" from={nwStart} to={nwEnd} />, share: `Nel ${y} il mio patrimonio è passato da ${money(nwStart, true)} a ${money(nwEnd, true)}` },
      { bg: 'linear-gradient(160deg,#1d4ed8,#0b2a6b)', body: <Trio income={flow.income} expense={flow.expense} net={flow.net} rate={rate} /> },
    ]
    if (cat && topCat) out.push({ bg: `linear-gradient(160deg,${cat.color},#1b1b1b)`, body: (
      <Center>
        <Badge icon={cat.icon} color="#ffffff" size={86} />
        <p className="mt-6 text-lg opacity-80">La categoria che ti è costata di più</p>
        <p className="mt-1 text-5xl font-semibold tracking-[-0.03em]">{cat.name}</p>
        <p className="num mt-3 text-2xl">{money(topCat[1], true)} · {percent(topCat[1] / Math.max(1, flow.expense))} delle uscite</p>
      </Center>
    ) })
    if (fav) out.push({ bg: 'linear-gradient(160deg,#7c3aed,#2e1065)', body: (
      <Center>
        <p className="text-lg opacity-80">Il posto dove sei tornato più spesso</p>
        <p className="mt-2 text-5xl leading-tight font-semibold tracking-[-0.03em] break-words">{titleCase(fav[0].toLowerCase())}</p>
        <p className="num mt-4 text-2xl"><Count to={fav[1].n} /> volte · {money(fav[1].total, true)}</p>
      </Center>
    ) })
    if (bestMonth) out.push({ bg: 'linear-gradient(160deg,#a87b22,#3d2a06)', body: (
      <Center>
        <p className="text-lg opacity-80">Il tuo mese migliore</p>
        <p className="mt-2 text-6xl font-semibold tracking-[-0.03em] capitalize">{format(parseISO(`${bestMonth[0]}-01`), 'MMMM', { locale: it })}</p>
        <p className="num mt-4 text-2xl">{bestMonth[1] >= 0 ? '+' : '−'}{money(Math.abs(bestMonth[1]), true)} di saldo</p>
      </Center>
    ) })
    if (bigDay) out.push({ bg: 'linear-gradient(160deg,#be123c,#4c0519)', body: (
      <Center>
        <p className="text-lg opacity-80">Il giorno più caro</p>
        <p className="mt-2 text-5xl font-semibold tracking-[-0.03em] first-letter:uppercase">{format(parseISO(bigDay[0]), 'd MMMM', { locale: it })}</p>
        <p className="num mt-4 text-3xl font-semibold">{money(bigDay[1])}</p>
      </Center>
    ) })
    if (subYear > 0) out.push({ bg: 'linear-gradient(160deg,#0e7490,#083344)', body: (
      <Center>
        <p className="text-lg opacity-80">I tuoi {subs.length} abbonamenti costano</p>
        <p className="num mt-2 text-6xl font-semibold tracking-[-0.03em]"><CountMoneyBig value={subYear} /></p>
        <p className="mt-3 text-xl opacity-85">all'anno, cioè {money(subYear / 12, true)} al mese</p>
      </Center>
    ) })
    out.push({ bg: 'linear-gradient(160deg,#0f4d3a,#06261d)', body: (
      <Center>
        <p className="text-lg opacity-80">Per il {Number(y) + 1}</p>
        <p className="mt-2 text-4xl leading-tight font-semibold tracking-[-0.02em]">{rate >= 0.2 ? 'Continua così: ora fai lavorare i risparmi.' : rate > 0 ? `Porta il risparmio dal ${percent(rate)} al 20%.` : 'Primo obiettivo: spendere meno di quanto entra.'}</p>
        <p className="mt-4 text-lg opacity-80">Il consulente AI ti prepara il piano.</p>
      </Center>
    ), share: `Nel ${y} ho risparmiato il ${percent(rate)} delle mie entrate` })
    return out
  }, [txs, accounts, snaps, categories, year])

  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const started = useRef(performance.now())
  const [, tick] = useState(0)

  useEffect(() => { started.current = performance.now() }, [i])
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (!paused && performance.now() - started.current > DURATION) {
        if (i < slides.length - 1) { setI(i + 1); haptic('tick') }
      }
      tick((n) => n + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [i, paused, slides.length])

  const go = (d: number) => { const n = Math.min(slides.length - 1, Math.max(0, i + d)); if (n !== i) { haptic('tick'); setI(n) } }
  const progress = Math.min(1, (performance.now() - started.current) / DURATION)
  const s = slides[i]

  return createPortal(
    <div className="story fixed inset-0 z-[65] overflow-hidden text-white" style={{ background: s.bg }}>
      <Guilloche className="pointer-events-none absolute -right-40 -bottom-40 h-[620px] w-[620px] text-white opacity-20" />
      <div className="absolute inset-x-0 top-0 z-10 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="flex gap-1">
          {slides.map((_, k) => (
            <span key={k} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <span className="block h-full bg-white" style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-semibold opacity-90">Il tuo {year}</span>
          <div className="flex gap-1">
            {s.share && navigator.share && <button onClick={() => navigator.share({ text: s.share }).catch(() => {})} className="rounded-full p-2" aria-label="Condividi"><Share size={20} /></button>}
            <button onClick={() => back('/statistiche')} className="rounded-full p-2" aria-label="Chiudi"><X size={22} /></button>
          </div>
        </div>
      </div>
      <div key={i} className="story-in absolute inset-0 flex items-center px-8">{s.body}</div>
      <button className="absolute inset-y-0 left-0 z-[5] w-1/3" aria-label="Indietro" onClick={() => go(-1)}
        onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)} />
      <button className="absolute inset-y-0 right-0 z-[5] w-2/3" aria-label="Avanti" onClick={() => (i === slides.length - 1 ? back('/statistiche') : go(1))}
        onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)} />
    </div>,
    document.body,
  )
}

function Center({ children }: { children: ReactNode }) { return <div className="w-full">{children}</div> }
function Big({ kicker, title, text }: { kicker?: string; title: string; text: string }) {
  return <Center>{kicker && <p className="text-sm font-semibold tracking-widest uppercase opacity-70">{kicker}</p>}<p className="mt-3 text-7xl leading-[0.95] font-semibold tracking-[-0.04em]">{title}</p><p className="mt-5 text-xl opacity-80">{text}</p></Center>
}
function Count({ to }: { to: number }) { const v = useCountUp(to, 1200); return <>{Math.round(v)}</> }
function CountMoneyBig({ value }: { value: number }) { const v = useCountUp(value, 1400); return <>{money(v, true)}</> }
function Amount({ kicker, from, to }: { kicker: string; from: number; to: number }) {
  const v = useCountUp(to, 1600)
  const d = to - from
  return (
    <Center>
      <p className="text-lg opacity-80">{kicker}</p>
      <p className="num mt-2 text-2xl opacity-70 line-through decoration-white/40">{money(from, true)}</p>
      <p className="num mt-1 text-6xl font-semibold tracking-[-0.04em]">{money(v, true)}</p>
      <p className="num mt-4 inline-block rounded-full bg-white/15 px-3 py-1 text-lg font-semibold">{d >= 0 ? '▲ +' : '▼ −'}{money(Math.abs(d), true)}</p>
    </Center>
  )
}
function Trio({ income, expense, net, rate }: { income: number; expense: number; net: number; rate: number }) {
  return (
    <Center>
      <p className="text-lg opacity-80">Quest'anno</p>
      <div className="mt-4 space-y-4">
        <div><p className="opacity-70">Sono entrati</p><p className="num text-5xl font-semibold tracking-[-0.03em]"><CountMoneyBig value={income} /></p></div>
        <div><p className="opacity-70">Sono usciti</p><p className="num text-5xl font-semibold tracking-[-0.03em]"><CountMoneyBig value={expense} /></p></div>
        <div><p className="opacity-70">Ti sono rimasti</p><p className="num text-5xl font-semibold tracking-[-0.03em]"><CountMoneyBig value={net} /></p><p className="mt-1 opacity-80">il {percent(rate)} di quello che hai guadagnato</p></div>
      </div>
    </Center>
  )
}
