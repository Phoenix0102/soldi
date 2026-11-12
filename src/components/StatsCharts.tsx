import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { money } from '../lib/format'
import { haptic } from '../lib/motion'

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el); setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Punto selezionato col dito. `bands`: ogni elemento occupa una fascia (barre); altrimenti punti agli estremi (linee).
 * La selezione resta dopo aver alzato il dito; toccando di nuovo lo stesso punto si toglie.
 */
function useScrub(n: number, bands = false) {
  const [i, setI] = useState<number | null>(null)
  const cur = useRef<number | null>(null)
  const g = useRef<{ prev: number | null; moved: boolean } | null>(null)
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.min(Math.max(0, e.clientX - r.left), r.width - 0.01)
    return bands ? Math.min(n - 1, Math.floor((x / r.width) * n)) : Math.round((x / r.width) * (n - 1))
  }
  const set = (k: number | null) => { if (k !== cur.current) { cur.current = k; setI(k); if (k !== null) haptic('tick') } }
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      g.current = { prev: cur.current, moved: false }
      set(at(e))
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (g.current) { const k = at(e); if (k !== cur.current) { g.current.moved = true; set(k) } }
      else if (e.pointerType === 'mouse') set(at(e))
    },
    onPointerUp: () => { const s = g.current; g.current = null; if (s && !s.moved && s.prev === cur.current) set(null) },
    onPointerCancel: () => { g.current = null },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse' && !g.current) set(null) },
  }
  return [i, handlers] as const
}

/** Aree impilate: come è cambiata la composizione del patrimonio. I debiti scendono sotto lo zero. */
export function StackedArea({ data, labels, colors, height = 200 }: {
  data: { label: string; parts: number[] }[]; labels: string[]; colors: string[]; height?: number
}) {
  const [ref, w] = useWidth()
  const [i, h] = useScrub(data.length)
  const geo = useMemo(() => {
    if (!w || data.length < 2) return null
    const pos = data.map((d) => d.parts.reduce((s, v) => s + Math.max(0, v), 0))
    const neg = data.map((d) => d.parts.reduce((s, v) => s + Math.min(0, v), 0))
    const top = Math.max(1, ...pos), bot = Math.min(0, ...neg)
    const y = (v: number) => 8 + (1 - (v - bot) / (top - bot)) * (height - 16)
    const x = (k: number) => (k / (data.length - 1)) * w
    const layers = labels.map((_, li) => {
      const upper: string[] = [], lower: string[] = []
      data.forEach((d, k) => {
        const v = d.parts[li]
        const sign = v >= 0 ? 1 : -1
        const before = d.parts.slice(0, li).filter((p) => Math.sign(p) === sign || (p === 0 && sign > 0)).reduce((s, p) => s + p, 0)
        upper.push(`${x(k).toFixed(1)},${y(before + v).toFixed(1)}`)
        lower.unshift(`${x(k).toFixed(1)},${y(before).toFixed(1)}`)
      })
      return `M${upper.join(' L')} L${lower.join(' L')} Z`
    })
    return { layers, zero: y(0), x }
  }, [data, w, labels, height])
  const sel = i !== null ? data[i] : data[data.length - 1]
  return (
    <div>
      <div ref={ref} className="relative touch-pan-y select-none" style={{ height }} {...h} data-no-swipe>
        {geo && (
          <svg width={w} height={height} className="block overflow-visible">
            {geo.layers.map((d, k) => <path key={k} d={d} fill={colors[k]} fillOpacity={0.85} className="area-in" style={{ animationDelay: `${k * 90}ms` }} />)}
            <line x1={0} x2={w} y1={geo.zero} y2={geo.zero} stroke="var(--line)" />
            {i !== null && <line x1={geo.x(i)} x2={geo.x(i)} y1={0} y2={height} stroke="var(--ink)" strokeOpacity={0.4} strokeDasharray="3 4" />}
          </svg>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between text-sm">
        <span className="text-muted capitalize">{sel?.label}</span>
        <span className="num font-semibold">{money(sel?.parts.reduce((s, v) => s + v, 0) ?? 0, true)}</span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {labels.map((l, k) => (
          <li key={l} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[k] }} />
            <span className="flex-1 truncate text-muted">{l}</span>
            <span className="num font-medium">{money(sel?.parts[k] ?? 0, true)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barre verticali con media tratteggiata; tocca per leggere il valore. */
export function Bars({ data, color = 'var(--brand)', height = 150, signed, format = (v: number) => money(v, true) }: {
  data: { label: string; value: number }[]; color?: string; height?: number; signed?: boolean; format?: (v: number) => string
}) {
  const [ref, w] = useWidth()
  const [i, h] = useScrub(data.length, true)
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)))
  const avg = data.length ? data.reduce((s, d) => s + d.value, 0) / data.length : 0
  const bw = w ? Math.max(4, (w / data.length) * 0.62) : 0
  const base = signed ? height / 2 : height - 4
  const scale = signed ? (height / 2 - 6) / max : (height - 10) / max
  const sel = i !== null ? data[i] : null
  return (
    <div>
      <div className="mb-2 flex h-5 items-baseline justify-between text-sm">
        <span className="text-muted capitalize">{sel ? sel.label : 'Media'}</span>
        <span className="num font-semibold">{format(sel ? sel.value : avg)}</span>
      </div>
      <div ref={ref} className="relative touch-pan-y select-none" style={{ height }} {...h} data-no-swipe>
        {w > 0 && (
          <svg width={w} height={height} className="block">
            {data.map((d, k) => {
              const cx = (k + 0.5) * (w / data.length)
              const hgt = Math.abs(d.value) * scale
              const up = d.value >= 0
              return <rect key={k} x={cx - bw / 2} y={up ? base - hgt : base} width={bw} height={Math.max(1.5, hgt)} rx={Math.min(5, bw / 2)}
                fill={signed ? (up ? 'var(--pos)' : 'var(--neg)') : color} opacity={i === null || i === k ? 1 : 0.35} className="bar-up" style={{ animationDelay: `${k * 25}ms`, transformOrigin: `${cx}px ${base}px` }} />
            })}
            {!signed && <line x1={0} x2={w} y1={base - avg * scale} y2={base - avg * scale} stroke="var(--ink)" strokeOpacity={0.35} strokeDasharray="4 5" />}
            {signed && <line x1={0} x2={w} y1={base} y2={base} stroke="var(--line)" />}
          </svg>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.68rem] text-faint capitalize">
        {data.map((d, k) => <span key={k} className="flex-1 text-center">{data.length > 8 && k % 2 ? '' : d.label.slice(0, 3)}</span>)}
      </div>
    </div>
  )
}

/** Proiezione: più linee che partono da oggi (scenari diversi). */
export function Projection({ lines, years, height = 190 }: { lines: { label: string; color: string; values: number[] }[]; years: number; height?: number }) {
  const [ref, w] = useWidth()
  const n = lines[0]?.values.length ?? 0
  const [i, h] = useScrub(n)
  const all = lines.flatMap((l) => l.values)
  const lo = Math.min(0, ...all), hi = Math.max(1, ...all)
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (height - 16)
  const x = (k: number) => (n > 1 ? (k / (n - 1)) * w : 0)
  const k = i ?? n - 1
  return (
    <div>
      <div ref={ref} className="relative touch-pan-y select-none" style={{ height }} {...h} data-no-swipe>
        {w > 0 && n > 1 && (
          <svg width={w} height={height} className="block overflow-visible">
            {lines.map((l) => <path key={l.label} d={l.values.map((v, j) => `${j ? 'L' : 'M'}${x(j).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={l.color} strokeWidth={2.5} strokeLinecap="round" pathLength={1} className="spark-draw" />)}
            <line x1={x(k)} x2={x(k)} y1={0} y2={height} stroke="var(--ink)" strokeOpacity={0.25} strokeDasharray="3 4" />
            {lines.map((l) => <circle key={l.label} cx={x(k)} cy={y(l.values[k])} r={4} fill={l.color} />)}
          </svg>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{k === 0 ? 'Oggi' : `Tra ${(k / (n - 1) * years).toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${k / (n - 1) * years === 1 ? 'anno' : 'anni'}`}</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
            <span className="flex-1 text-muted">{l.label}</span>
            <span className="num font-semibold">{money(l.values[k], true)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
