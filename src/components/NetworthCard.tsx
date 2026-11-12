import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Guilloche } from './Guilloche'
import { CountMoney } from './ui'
import { money } from '../lib/format'

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

/** Grafico da esplorare col dito: mentre scorri, `onScrub` riceve il punto toccato. */
export function ScrubChart({ data, onScrub, height = 150, className = '' }: {
  data: { value: number }[]; onScrub: (i: number | null) => void; height?: number; className?: string
}) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const pts = useMemo(() => (w && data.length > 1 ? geometry(data, w, height, 10) : []), [data, w, height])
  const line = smoothPath(pts)

  const pick = (e: React.PointerEvent) => {
    if (!pts.length) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.min(Math.max(0, e.clientX - r.left), r.width)
    const i = Math.round((x / r.width) * (data.length - 1))
    if (i !== hover) { setHover(i); onScrub(i) }
  }
  const end = () => { setHover(null); onScrub(null) }
  const p = hover !== null ? pts[hover] : null

  return (
    <div ref={ref} className={`relative touch-pan-y select-none ${className}`} style={{ height }}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pick(e) }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') pick(e) }}
      onPointerUp={end} onPointerCancel={end} onPointerLeave={(e) => { if (e.pointerType === 'mouse') end() }}
      data-no-swipe role="img" aria-label="Andamento del patrimonio">
      {line && (
        <svg width={w} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id="scrub" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.24} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
            <clipPath id="scrub-clip"><rect x={0} y={0} width={p ? p[0] : w} height={height} /></clipPath>
          </defs>
          <path d={`${line} L${w},${height} L0,${height} Z`} fill="url(#scrub)" />
          <path d={line} fill="none" stroke="currentColor" strokeOpacity={p ? 0.35 : 1} strokeWidth={2.25} strokeLinecap="round" className="spark-draw" pathLength={1} />
          {p && <path d={line} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" clipPath="url(#scrub-clip)" />}
          {p && (
            <>
              <line x1={p[0]} x2={p[0]} y1={0} y2={height} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 4" />
              <circle cx={p[0]} cy={p[1]} r={9} fill="currentColor" fillOpacity={0.18} />
              <circle cx={p[0]} cy={p[1]} r={4.5} fill="currentColor" />
            </>
          )}
        </svg>
      )}
    </div>
  )
}
