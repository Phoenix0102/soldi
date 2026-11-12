import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Guilloche } from './Guilloche'
import { CountMoney } from './ui'
import { money } from '../lib/format'
import { haptic } from '../lib/motion'

/**
 * Il pannello verde del patrimonio. La luce segue il dito (o il mouse) come su una carta in metallo,
 * il rosone ruota lentamente.
 */
export function NetworthPanel({ children, onClick, className = '', quiet }: { children: ReactNode; onClick?: () => void; className?: string; quiet?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag ref={ref as never} onClick={onClick} onPointerMove={move} onPointerDown={move}
      className={`nw-panel relative block w-full overflow-hidden rounded-[30px] bg-note text-left text-note-ink ${onClick ? 'nw-press' : ''} ${className}`}>
      <span aria-hidden className="nw-sheen pointer-events-none absolute inset-0" />
      <Guilloche className={`pointer-events-none absolute -right-28 -top-36 h-[480px] w-[480px] ${quiet ? 'opacity-20' : 'opacity-45'}`} />
      <div className="relative">{children}</div>
    </Tag>
  )
}

/** Versione compatta per la Home: tocchi e apri la pagina Patrimonio. */
export function NetworthSummary({ total, delta, liquid, investments, debts, series, onOpen }: {
  total: number; delta: number; liquid: number; investments: number; debts: number; series: { value: number }[]; onOpen: () => void
}) {
  return (
    <NetworthPanel onClick={onOpen} className="px-6 pt-6 pb-5">
      <div className="flex items-center justify-between">
        <p className="text-sm opacity-75">Patrimonio netto</p>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-white/12 py-1 pr-2 pl-3 text-xs font-medium">Dettagli <ChevronRight size={14} /></span>
      </div>
      <p className="mt-1.5 text-[clamp(2.3rem,11vw,3.6rem)] leading-none font-semibold tracking-[-0.04em]"><CountMoney value={total} /></p>
      <p className="num mt-2.5 text-sm opacity-85">
        <span className={`mr-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${delta >= 0 ? 'bg-white/15' : 'bg-[#ffb4ab]/20 text-[#ffd5cf]'}`}>{delta >= 0 ? '▲' : '▼'} {money(Math.abs(delta), true)}</span>
        da fine mese scorso
      </p>
      <Sparkline data={series} className="-mx-6 mt-4 h-16" />
      <dl className="mt-2 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-[0.8rem]">
        <Stat label="Liquidità" value={liquid} />
        <Stat label="Investimenti" value={investments} />
        <Stat label="Debiti" value={debts} />
      </dl>
    </NetworthPanel>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0"><dt className="truncate opacity-70">{label}</dt><dd className="num mt-0.5 font-semibold">{money(value, true)}</dd></div>
}

/* ---------- Curve ---------- */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const t = 0.16
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t]
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t]
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return d
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function geometry(data: { value: number }[], w: number, h: number, pad = 6) {
  const vals = data.map((d) => d.value)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  // Scala proporzionata: piccole oscillazioni su un patrimonio grande non diventano montagne
  const span = Math.max(hi - lo, Math.max(Math.abs(hi), Math.abs(lo)) * 0.35, 1)
  const min = lo - (span - (hi - lo)) / 2
  return data.map((d, i) => [
    data.length === 1 ? w / 2 : (i / (data.length - 1)) * w,
    pad + (1 - (d.value - min) / span) * (h - pad * 2),
  ] as [number, number])
}

/** Linea leggera, senza interazione (Home). */
export function Sparkline({ data, className = '' }: { data: { value: number }[]; className?: string }) {
  const [ref, w] = useWidth()
  const h = 64
  const pts = useMemo(() => (w && data.length > 1 ? geometry(data, w, h) : []), [data, w])
  const line = smoothPath(pts)
  return (
    <div ref={ref} className={className} aria-hidden>
      {line && (
        <svg width={w} height={h} className="block overflow-visible">
          <defs>
            <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#spark)" />
          <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="spark-draw" pathLength={1} />
        </svg>
      )}
    </div>
  )
}

/**
 * Grafico da esplorare col dito.
 * - tocca o trascina: `onScrub` riceve il punto (indice nella serie completa); la selezione resta
 *   dopo aver alzato il dito, un altro tocco sullo stesso punto la toglie;
 * - `view` = quanti punti si vedono insieme; se la storia è più lunga, sotto c'è una mini mappa
 *   con la finestra da trascinare (o da spostare toccando) per tornare indietro nel tempo.
 * La scala verticale si adatta alla finestra con un'animazione.
 */
export function ScrubChart({ data, onScrub, onView, view, height = 150, className = '', label }: {
  data: { value: number }[]; onScrub: (i: number | null) => void; onView?: (start: number, end: number) => void
  view?: number; height?: number; className?: string; label?: (i: number) => string
}) {
  const [ref, w] = useWidth()
  const n = data.length
  const span = Math.max(2, Math.min(n, view ?? n))
  const maxStart = Math.max(0, n - span)
  const [start, setStart] = useState(maxStart)
  const [hover, setHover] = useState<number | null>(null)
  const hoverRef = useRef<number | null>(null)
  const startRef = useRef(start)
  startRef.current = start
  // Nuovi dati o nuova finestra: si riparte dal presente
  useLayoutEffect(() => { setStart(maxStart); startRef.current = maxStart }, [n, span]) // eslint-disable-line react-hooks/exhaustive-deps
  const s0 = Math.min(Math.max(0, start), maxStart)
  const a0 = Math.round(s0), b0 = Math.min(n - 1, Math.round(s0) + span - 1)
  const viewCb = useRef(onView)
  viewCb.current = onView
  useLayoutEffect(() => { viewCb.current?.(a0, b0) }, [a0, b0])

  // Dominio verticale della finestra visibile, raggiunto con una molla leggera
  const target = useMemo(() => {
    const a = Math.max(0, Math.floor(s0)), b = Math.min(n - 1, Math.ceil(s0 + span - 1))
    let lo = Infinity, hi = -Infinity
    for (let i = a; i <= b; i++) { lo = Math.min(lo, data[i].value); hi = Math.max(hi, data[i].value) }
    if (!isFinite(lo)) { lo = 0; hi = 1 }
    const sp = Math.max(hi - lo, Math.max(Math.abs(hi), Math.abs(lo)) * 0.35, 1)
    return [lo - (sp - (hi - lo)) / 2, sp] as const
  }, [data, s0, span, n])
  const [dom, setDom] = useState(target)
  const domRef = useRef(dom)
  domRef.current = dom
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const [m, sp] = domRef.current
      const nm = m + (target[0] - m) * 0.22, ns = sp + (target[1] - sp) * 0.22
      const done = Math.abs(nm - target[0]) < target[1] * 0.002 && Math.abs(ns - target[1]) < target[1] * 0.002
      setDom(done ? target : [nm, ns])
      if (!done) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const pad = 10
  const xOf = (i: number) => ((i - s0) / (span - 1)) * w
  const yOf = (v: number) => pad + (1 - (v - dom[0]) / dom[1]) * (height - pad * 2)
  const a = Math.max(0, Math.floor(s0) - 1), b = Math.min(n - 1, Math.ceil(s0 + span - 1) + 1)
  const pts: [number, number][] = []
  if (w && n > 1) for (let i = a; i <= b; i++) pts.push([xOf(i), yOf(data[i].value)])
  const line = smoothPath(pts)
  const p = hover !== null && w && hover >= a && hover <= b ? [xOf(hover), yOf(data[hover].value)] as const : null

  // ---- tocco ----
  const g = useRef<{ prev: number | null; moved: boolean } | null>(null)
  const select = (i: number | null) => {
    if (hoverRef.current === i) return
    hoverRef.current = i; setHover(i); onScrub(i)
    if (i !== null) haptic('tick')
  }
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const rel = Math.min(Math.max(0, e.clientX - r.left), r.width)
    return Math.min(b0, Math.max(a0, Math.round(startRef.current + (rel / r.width) * (span - 1))))
  }
  // Spostando la finestra la selezione si toglie (il punto potrebbe non essere più visibile)
  const moveWindow = (v: number) => {
    const nx = Math.min(Math.max(0, v), maxStart)
    startRef.current = nx; setStart(nx)
    if (hoverRef.current !== null) select(null)
  }
  const settle = () => moveWindow(Math.round(startRef.current))

  return (
    <div className={className}>
      <div ref={ref} className="relative touch-pan-y select-none overflow-hidden" style={{ height }}
        onPointerDown={(e) => {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          g.current = { prev: hoverRef.current, moved: false }
          select(at(e))
        }}
        onPointerMove={(e) => {
          if (g.current) { const k = at(e); if (k !== hoverRef.current) { g.current.moved = true; select(k) } }
          else if (e.pointerType === 'mouse') select(at(e))
        }}
        onPointerUp={() => { const s = g.current; g.current = null; if (s && !s.moved && s.prev === hoverRef.current) select(null) }}
        onPointerCancel={() => { g.current = null }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !g.current) select(null) }}
        data-no-swipe role="img" aria-label="Andamento nel tempo">
        {line && (
          <svg width={w} height={height} className="chart-in block">
            <defs>
              <linearGradient id="scrub" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.24} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
              <clipPath id="scrub-clip"><rect x={0} y={0} width={p ? p[0] : w} height={height} /></clipPath>
            </defs>
            <path d={`${line} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`} fill="url(#scrub)" />
            <path d={line} fill="none" stroke="currentColor" strokeOpacity={p ? 0.35 : 1} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
            {p && <path d={line} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" clipPath="url(#scrub-clip)" />}
            {p && (
              <>
                <line x1={p[0]} x2={p[0]} y1={0} y2={height} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 4" />
                <circle cx={p[0]} cy={p[1]} r={10} fill="currentColor" fillOpacity={0.18} className="scrub-pulse" />
                <circle cx={p[0]} cy={p[1]} r={4.5} fill="currentColor" />
              </>
            )}
          </svg>
        )}
      </div>
      {label && n > 1 && (
        <div className="mt-1.5 flex justify-between px-4 text-[0.7rem] font-medium opacity-60 first-letter:uppercase">
          <span className="first-letter:uppercase">{label(a0)}</span>
          <span className="first-letter:uppercase">{b0 >= n - 1 ? 'Oggi' : label(b0)}</span>
        </div>
      )}
      {maxStart > 0 && w > 0 && <Navigator data={data} start={s0} span={span} w={w} onMove={moveWindow} onEnd={settle} />}
    </div>
  )
}

/* Mini mappa di tutta la storia: la finestra evidenziata si trascina col dito (o si tocca un punto) */
function Navigator({ data, start, span, w, onMove, onEnd }: { data: { value: number }[]; start: number; span: number; w: number; onMove: (s: number) => void; onEnd: () => void }) {
  const h = 30
  const iw = Math.max(10, w - 32)
  const pts = useMemo(() => geometry(data, iw, h, 5), [data, iw])
  const line = smoothPath(pts)
  const n = data.length
  const unit = iw / (n - 1)
  const x0 = start * unit, x1 = (start + span - 1) * unit
  const drag = useRef<{ x: number; s: number } | null>(null)
  return (
    <div className="relative mx-4 mt-3 select-none touch-pan-y" style={{ height: h }} data-no-swipe
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = e.clientX - r.left
        // Toccando fuori dalla finestra la porto lì (centrata), poi si trascina
        let s = start
        if (x < x0 - 6 || x > x1 + 6) { s = x / unit - (span - 1) / 2; onMove(s); haptic('tick') }
        drag.current = { x: e.clientX, s }
      }}
      onPointerMove={(e) => { const d = drag.current; if (d) onMove(d.s + (e.clientX - d.x) / unit) }}
      onPointerUp={() => { drag.current = null; onEnd() }} onPointerCancel={() => { drag.current = null; onEnd() }}
      aria-label="Scorri nel tempo" role="slider" aria-valuemin={0} aria-valuemax={n - span} aria-valuenow={Math.round(start)}>
      <svg width={iw} height={h} className="block overflow-visible">
        <path d={line} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} />
        <rect x={x0 - 5} y={0} width={Math.max(16, x1 - x0 + 10)} height={h} rx={10} fill="currentColor" fillOpacity={0.13} stroke="currentColor" strokeOpacity={0.5} />
        <rect x={x0 - 1.5} y={h / 2 - 6} width={3} height={12} rx={1.5} fill="currentColor" fillOpacity={0.75} />
        <rect x={Math.max(x0 + 8, x1) - 1.5} y={h / 2 - 6} width={3} height={12} rx={1.5} fill="currentColor" fillOpacity={0.75} />
      </svg>
    </div>
  )
}
