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
 * - tieni premuto e scorri: `onScrub` riceve il punto toccato (indice nella serie completa);
 * - colpo rapido a destra/sinistra: la finestra scorre nel tempo con inerzia;
 * - durante lo scrub, vicino ai bordi la finestra avanza da sola;
 * - sotto, una mini mappa di tutta la storia con la finestra da trascinare.
 * `view` = quanti punti si vedono insieme (default: tutti). La scala verticale si adatta con un'animazione.
 */
export function ScrubChart({ data, onScrub, onView, view, height = 150, className = '' }: {
  data: { value: number }[]; onScrub: (i: number | null) => void; onView?: (start: number, end: number) => void
  view?: number; height?: number; className?: string
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
  useLayoutEffect(() => { setStart(maxStart) }, [n, span]) // eslint-disable-line react-hooks/exhaustive-deps
  const s0 = Math.min(Math.max(0, start), maxStart)
  const viewCb = useRef(onView)
  viewCb.current = onView
  useLayoutEffect(() => { viewCb.current?.(Math.round(s0), Math.min(n - 1, Math.round(s0) + span - 1)) }, [Math.round(s0), span, n]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const p = hover !== null && w ? [xOf(hover), yOf(data[hover].value)] as const : null

  // ---- gesti ----
  const g = useRef<{ id: number; x0: number; y0: number; t0: number; mode: 'wait' | 'scrub' | 'pan'; s: number; lx: number; lt: number; v: number; timer: number } | null>(null)
  const auto = useRef(0)
  const inertia = useRef(0)
  const box = useRef<DOMRect | null>(null)
  const lastX = useRef(0)
  const clampS = (v: number) => Math.min(Math.max(0, v), maxStart)
  const scrubAt = (x: number) => {
    const r = box.current
    if (!r || !w) return
    const rel = Math.min(Math.max(0, x - r.left), r.width)
    const i = Math.min(n - 1, Math.max(0, Math.round(startRef.current + (rel / r.width) * (span - 1))))
    if (hoverRef.current !== i) { hoverRef.current = i; setHover(i); onScrub(i) }
    // Ai bordi la finestra scorre da sola, più veloce quanto più sei vicino
    const edge = r.width * 0.1
    const dir = rel < edge && startRef.current > 0 ? -(1 - rel / edge) : rel > r.width - edge && startRef.current < maxStart ? (1 - (r.width - rel) / edge) : 0
    cancelAnimationFrame(auto.current)
    if (dir) {
      const step = () => {
        const nx = clampS(startRef.current + dir * 0.18)
        if (nx === startRef.current) return
        startRef.current = nx
        setStart(nx)
        scrubAt(lastX.current)
      }
      auto.current = requestAnimationFrame(step)
    }
  }
  const startScrub = (x: number) => {
    const s = g.current
    if (!s) return
    s.mode = 'scrub'
    scrubAt(x)
  }
  const end = () => {
    const s = g.current
    g.current = null
    cancelAnimationFrame(auto.current)
    if (s) clearTimeout(s.timer)
    if (s?.mode === 'pan' && Math.abs(s.v) > 0.002) {
      // Inerzia: la finestra continua un po' e rallenta
      let v = s.v
      const step = () => {
        v *= 0.93
        const nx = clampS(startRef.current + v * 16)
        startRef.current = nx
        setStart(nx)
        if (Math.abs(v) > 0.0015 && nx > 0 && nx < maxStart) inertia.current = requestAnimationFrame(step)
        else settle()
      }
      inertia.current = requestAnimationFrame(step)
    } else if (s?.mode === 'pan') settle()
    hoverRef.current = null; setHover(null); onScrub(null)
  }
  // A fine movimento la finestra si allinea a un punto intero
  const settle = () => {
    const from = startRef.current, to = Math.round(from)
    if (from === to) return
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 220), e = 1 - (1 - k) ** 3
      const nx = from + (to - from) * e
      startRef.current = nx
      setStart(nx)
      if (k < 1) inertia.current = requestAnimationFrame(step)
    }
    inertia.current = requestAnimationFrame(step)
  }

  return (
    <div className={className}>
      <div ref={ref} className="relative touch-pan-y select-none overflow-hidden" style={{ height }}
        onPointerDown={(e) => {
          cancelAnimationFrame(inertia.current)
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          box.current = (e.currentTarget as HTMLElement).getBoundingClientRect()
          lastX.current = e.clientX
          const canPan = maxStart > 0
          g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), mode: 'wait', s: startRef.current, lx: e.clientX, lt: performance.now(), v: 0, timer: 0 }
          // Col mouse o senza storia da scorrere si esplora subito; col dito aspetto un attimo per capire il gesto
          if (!canPan || e.pointerType === 'mouse') startScrub(e.clientX)
          else g.current.timer = window.setTimeout(() => { if (g.current?.mode === 'wait') startScrub(lastX.current) }, 150)
        }}
        onPointerMove={(e) => {
          const s = g.current
          if (!s || s.id !== e.pointerId) { if (e.pointerType === 'mouse' && !e.buttons) { box.current = (e.currentTarget as HTMLElement).getBoundingClientRect(); scrubAt(e.clientX) } return }
          lastX.current = e.clientX
          const dx = e.clientX - s.x0
          if (s.mode === 'wait' && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(e.clientY - s.y0)) {
            clearTimeout(s.timer); s.mode = 'pan'; s.x0 = e.clientX; s.s = startRef.current
          }
          if (s.mode === 'scrub') scrubAt(e.clientX)
          else if (s.mode === 'pan') {
            const r = box.current!
            const nx = clampS(s.s - ((e.clientX - s.x0) / r.width) * (span - 1))
            const now = performance.now()
            s.v = (nx - startRef.current) / Math.max(1, now - s.lt)
            s.lt = now
            if ((nx === 0 || nx === maxStart) && startRef.current !== nx) haptic('tick')
            startRef.current = nx
            setStart(nx)
          }
        }}
        onPointerUp={end} onPointerCancel={end} onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !g.current) { hoverRef.current = null; setHover(null); onScrub(null) } }}
        data-no-swipe role="img" aria-label="Andamento nel tempo">
        {line && (
          <svg width={w} height={height} className="chart-in block" style={maxStart > 0 ? {
            // Bordi sfumati quando c'è altra storia da quella parte
            WebkitMaskImage: `linear-gradient(to right, ${s0 > 0.05 ? 'transparent, black 28px' : 'black, black'}, ${s0 < maxStart - 0.05 ? 'black calc(100% - 28px), transparent' : 'black, black'})`,
            maskImage: `linear-gradient(to right, ${s0 > 0.05 ? 'transparent, black 28px' : 'black, black'}, ${s0 < maxStart - 0.05 ? 'black calc(100% - 28px), transparent' : 'black, black'})`,
          } : undefined}>
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
      {maxStart > 0 && w > 0 && <Navigator data={data} start={s0} span={span} w={w} onMove={(v) => { cancelAnimationFrame(inertia.current); const nx = clampS(v); startRef.current = nx; setStart(nx) }} onEnd={settle} />}
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
