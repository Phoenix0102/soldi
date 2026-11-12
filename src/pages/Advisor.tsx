import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, RefreshCw, ArrowUp, ShieldCheck, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useAccounts, useBalances, useBudgets, useCategories, useGoals, useRecurring, useSnapshots, useTransactions } from '../lib/data'
import { buildSummary } from '../lib/finsummary'
import { aiConfigured, callFn } from '../lib/ai'
import { money } from '../lib/format'
import { haptic } from '../lib/motion'
import { BackButton } from '../components/back'
import { Link } from '../components/nav'
import { PageHeader, SkeletonPage, useCountUp, useToast } from '../components/ui'

type Analysis = {
  score: number; headline: string
  scores?: Record<string, number>
  strengths: string[]; risks: string[]
  actions: { title: string; detail: string; impact: 'alto' | 'medio' | 'basso'; monthly: number | null }[]
  plan?: { emergenza?: number; risparmioMensile?: number; investimentoMensile?: number }
  outlook?: string
}
type Msg = { role: 'user' | 'assistant'; content: string }

const CACHE = 'soldi-advisor'
const CHAT = 'soldi-advisor-chat'
const SUGGESTIONS = [
  'Dove sto spendendo troppo?',
  'Come risparmio 200 € al mese?',
  'Quanto dovrei avere nel fondo emergenza?',
  'Conviene iniziare un PAC adesso?',
  'Com\'è andato l\'ultimo mese rispetto alla media?',
]

/** Riepilogo finanziario aggiornato, pronto per l'AI. */
export function useFinSummary() {
  const { data: accounts } = useAccounts()
  const { data: balances } = useBalances()
  const { data: txs } = useTransactions()
  const { data: snaps = [] } = useSnapshots()
  const { data: categories = [] } = useCategories()
  const { data: budgets = [] } = useBudgets()
  const { data: goals = [] } = useGoals()
  const { data: recurring = [] } = useRecurring()
  return useMemo(() => (accounts && txs ? buildSummary({ accounts, balances, txs, snaps, categories, budgets, goals, recurring }) : null),
    [accounts, balances, txs, snaps, categories, budgets, goals, recurring])
}

export default function Advisor() {
  const summary = useFinSummary()
  const toast = useToast()
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: () => aiConfigured().then((configured) => ({ configured })), staleTime: 5 * 60_000 })
  const [cached, setCached] = useState<{ analysis: Analysis; at: string } | null>(() => { try { return JSON.parse(localStorage.getItem(CACHE) ?? 'null') } catch { return null } })
  const [busy, setBusy] = useState(false)

  const analyze = async () => {
    if (!summary) return
    setBusy(true)
    try {
      const r = await callFn<{ analysis: Analysis; at: string }>('advisor', { action: 'analyze', summary })
      setCached(r); localStorage.setItem(CACHE, JSON.stringify(r)); haptic('success')
    } catch (e) { toast((e as Error).message, { tone: 'err' }) }
    finally { setBusy(false) }
  }
  // Prima apertura (o analisi più vecchia di 7 giorni): la preparo da sola
  useEffect(() => {
    if (!ai.data?.configured || !summary || busy) return
    if (!cached || Date.now() - +new Date(cached.at) > 7 * 86400000) analyze()
  }, [ai.data?.configured, !!summary]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!summary || ai.isLoading) return <SkeletonPage hero />

  return (
    <div>
      <BackButton label="Home" fallback="/" />
      <PageHeader title="Consulente" subtitle="L'AI legge i tuoi numeri e ti dice cosa fare, in ordine di importanza." />

      {!ai.data?.configured ? (
        <div className="rounded-3xl bg-surface p-6 text-center">
          <Sparkles className="mx-auto text-brand" />
          <p className="mt-3 font-semibold">Attiva l'AI per avere il tuo consulente</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Serve una chiave di Anthropic (pochi centesimi al mese). La stessa chiave serve anche per smistare i movimenti.</p>
          <Link to="/impostazioni/collegamenti" className="btn btn-primary mt-4">Attiva in Impostazioni</Link>
        </div>
      ) : (
        <>
          {busy && !cached ? <Thinking /> : cached && <Report a={cached.analysis} at={cached.at} busy={busy} onRefresh={analyze} />}
          <Chat summary={summary} />
          <p className="mt-6 text-center text-xs text-faint">Suggerimenti generati dall'AI sui tuoi dati: non sono una consulenza finanziaria professionale.</p>
        </>
      )}
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex flex-col items-center rounded-[28px] bg-note px-6 py-12 text-note-ink">
      <div className="ai-orb" />
      <p className="mt-6 font-semibold">Sto analizzando i tuoi conti…</p>
      <p className="mt-1 text-sm opacity-75">Patrimonio, spese, abbonamenti, obiettivi</p>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const v = useCountUp(score, 1400)
  const r = 52, c = 2 * Math.PI * r
  const tone = score >= 75 ? '#6fd3a8' : score >= 50 ? '#f5c46b' : '#ff9a8f'
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-4xl font-semibold tracking-[-0.03em]">{Math.round(v)}</span>
        <span className="text-xs opacity-70">su 100</span>
      </div>
    </div>
  )
}

const LABELS: Record<string, string> = { risparmio: 'Risparmio', emergenza: 'Fondo emergenza', debiti: 'Debiti', investimenti: 'Investimenti', spese: 'Controllo spese' }

function Report({ a, at, busy, onRefresh }: { a: Analysis; at: string; busy: boolean; onRefresh: () => void }) {
  return (
    <>
      <section className="relative overflow-hidden rounded-[30px] bg-note p-6 text-note-ink">
        <span aria-hidden className="ai-glow" />
        <div className="relative flex flex-col items-center gap-5 sm:flex-row">
          <ScoreRing score={a.score} />
          <div className="text-center sm:text-left">
            <p className="text-sm opacity-75">Salute finanziaria</p>
            <p className="mt-1 text-xl leading-snug font-semibold">{a.headline}</p>
            <button onClick={onRefresh} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-medium">
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {busy ? 'Aggiorno…' : `Aggiornata il ${new Date(at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
            </button>
          </div>
        </div>
        {a.scores && (
          <div className="relative mt-6 grid grid-cols-1 gap-2.5 border-t border-white/15 pt-5">
            {Object.entries(a.scores).map(([k, v], i) => (
              <div key={k} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="opacity-80">{LABELS[k] ?? k}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/15"><span className="bar-fill block h-full rounded-full bg-note-ink" style={{ width: `${v}%`, animationDelay: `${i * 80}ms` }} /></span>
                <span className="num text-right font-semibold">{v}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Box icon={<CheckCircle2 size={18} className="text-pos" />} title="Cosa fai bene" items={a.strengths} />
        <Box icon={<AlertTriangle size={18} className="text-gold" />} title="Attenzione a" items={a.risks} />
      </div>

      {a.plan && (
        <section className="mt-5 grid grid-cols-3 gap-2.5">
          {[['Fondo emergenza', a.plan.emergenza], ['Da risparmiare', a.plan.risparmioMensile, '/mese'], ['Da investire', a.plan.investimentoMensile, '/mese']].map(([l, v, suf]) => (
            <div key={l as string} className="rounded-3xl bg-surface px-3.5 py-3.5">
              <p className="truncate text-[0.78rem] text-muted">{l}</p>
              <p className="num mt-0.5 text-[1.05rem] font-semibold">{typeof v === 'number' ? money(v, true) : '—'}<span className="text-xs font-normal text-muted">{suf as string}</span></p>
            </div>
          ))}
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={19} /> Il tuo piano</h2>
        <ol className="space-y-2.5">
          {a.actions.map((x, i) => (
            <li key={i} className="rise flex gap-3.5 rounded-3xl bg-surface p-4" style={{ '--i': i } as React.CSSProperties}>
              <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{x.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase ${x.impact === 'alto' ? 'bg-brand text-brand-ink' : x.impact === 'medio' ? 'bg-brand-soft text-brand' : 'bg-sunken text-muted'}`}>impatto {x.impact}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{x.detail}</p>
                {x.monthly ? <p className="num mt-1.5 text-sm font-semibold text-pos">+{money(x.monthly, true)} al mese</p> : null}
              </div>
            </li>
          ))}
        </ol>
        {a.outlook && <p className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-sm"><strong>Tra 12 mesi:</strong> {a.outlook}</p>}
      </section>
    </>
  )
}

function Box({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <section className="rounded-3xl bg-surface p-5">
      <h3 className="mb-2.5 flex items-center gap-2 font-semibold">{icon} {title}</h3>
      <ul className="space-y-2 text-sm">{items.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />{t}</li>)}</ul>
    </section>
  )
}

/* ---------- Chat ---------- */
function Chat({ summary }: { summary: unknown }) {
  const toast = useToast()
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(CHAT) ?? '[]') } catch { return [] } })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { localStorage.setItem(CHAT, JSON.stringify(msgs.slice(-20))) }, [msgs])
  useEffect(() => { if (msgs.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [msgs.length, busy])

  const send = async (q: string) => {
    const content = q.trim()
    if (!content || busy) return
    haptic('light')
    const next = [...msgs, { role: 'user' as const, content }]
    setMsgs(next); setText(''); setBusy(true)
    try {
      const r = await callFn<{ reply: string }>('advisor', { action: 'chat', summary, messages: next })
      setMsgs([...next, { role: 'assistant', content: r.reply }])
    } catch (e) { toast((e as Error).message, { tone: 'err' }); setMsgs(msgs) }
    finally { setBusy(false) }
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} className="text-brand" /> Chiedi a Soldi</h2>
        {msgs.length > 0 && <button onClick={() => setMsgs([])} className="text-sm text-muted">Nuova chat</button>}
      </div>
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`chat-bubble max-w-[85%] rounded-3xl px-4 py-2.5 text-[0.95rem] leading-relaxed ${m.role === 'user' ? 'rounded-br-lg bg-brand text-brand-ink' : 'rounded-bl-lg bg-surface'}`}>
              {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
            </div>
          </div>
        ))}
        {busy && <div className="flex"><div className="rounded-3xl rounded-bl-lg bg-surface px-4 py-3"><span className="typing"><i /><i /><i /></span></div></div>}
        <div ref={end} />
      </div>
      {!msgs.length && (
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" data-no-swipe>
          {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="press shrink-0 rounded-full bg-surface px-4 py-2 text-sm font-medium">{s}</button>)}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="mt-3 flex items-end gap-2 rounded-[26px] bg-surface p-1.5 pl-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Fai una domanda sui tuoi soldi…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 outline-none placeholder:text-faint" />
        <button disabled={!text.trim() || busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink disabled:opacity-40" aria-label="Invia">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} strokeWidth={2.5} />}
        </button>
      </form>
    </section>
  )
}

/** Markdown minimo: **grassetto**, elenchi "- ", paragrafi. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>)
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return <ul key={i} className="space-y-1">{lines.map((l, j) => <li key={j} className="flex gap-2"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" /><span>{inline(l.replace(/^\s*[-•]\s+/, ''))}</span></li>)}</ul>
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ''))}</Fragment>)}</p>
      })}
    </div>
  )
}
