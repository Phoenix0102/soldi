import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { money } from '../lib/format'
import { reducedMotion } from '../lib/motion'

/* ---------- Sheet: pannello dal basso su mobile, finestra su desktop ---------- */
export function Sheet({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean
}) {
  const [leaving, setLeaving] = useState(false)
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const close = useCallback(() => {
    if (reducedMotion()) return closeRef.current()
    setLeaving(true)
    setTimeout(() => { setLeaving(false); setDrag(0); closeRef.current() }, 200)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, close])

  if (!open) return null

  // Trascina verso il basso per chiudere (solo dal bordo superiore del pannello)
  const onDown = (e: React.PointerEvent) => {
    if (window.innerWidth >= 640 || (panel.current?.scrollTop ?? 0) > 0) return
    start.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => { if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current)) }
  const onUp = () => {
    if (start.current === null) return
    start.current = null
    if (drag > 110) close()
    else setDrag(0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] ${leaving ? 'fade-leave' : 'fade-enter'}`} onClick={close}
        style={{ opacity: drag ? Math.max(0.2, 1 - drag / 400) : undefined }} />
      <div ref={panel}
        className={`relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-surface pb-safe shadow-2xl sm:rounded-[24px] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} ${leaving ? 'sheet-leave' : 'sheet-enter'}`}
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: start.current === null ? 'transform .25s var(--ease-out)' : 'none' }}>
        <div className="sticky top-0 z-10 cursor-grab touch-none bg-surface/95 px-5 pt-4 pb-2 backdrop-blur sm:cursor-auto"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-line sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={close} onPointerDown={(e) => e.stopPropagation()} className="rounded-full p-2 text-muted transition hover:bg-sunken active:scale-90" aria-label="Chiudi"><X size={20} /></button>
          </div>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}

/* ---------- Conferma (al posto di window.confirm) ---------- */
export function Confirm({ open, title, text, confirmLabel, danger, onConfirm, onClose }: {
  open: boolean; title: string; text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-muted">{text}</p>
      <div className="mt-6 flex gap-3">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Annulla</button>
        <button disabled={busy} className={`btn flex-1 ${danger ? 'bg-neg text-white' : 'btn-primary'}`}
          onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{busy ? 'Attendi…' : confirmLabel}</button>
      </div>
    </Sheet>
  )
}

/* ---------- Toast ---------- */
type ToastT = { id: number; text: string; tone: 'ok' | 'err'; leaving?: boolean; action?: { label: string; run: () => void } }
type Push = (text: string, opts?: { tone?: 'ok' | 'err'; action?: ToastT['action'] }) => void
const ToastCtx = createContext<Push>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const dismiss = useCallback((id: number) => {
    setItems((s) => s.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 220)
  }, [])
  const push = useCallback<Push>((text, opts) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s.slice(-2), { id, text, tone: opts?.tone ?? 'ok', action: opts?.action }])
    setTimeout(() => dismiss(id), opts?.action ? 6000 : 3000)
  }, [dismiss])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex max-w-full items-center gap-4 rounded-full px-5 py-3 text-sm font-medium shadow-xl ${t.leaving ? 'toast-leave' : 'toast-enter'} ${t.tone === 'err' ? 'bg-neg text-white' : 'bg-ink text-paper'}`}>
            <span className="min-w-0">{t.text}</span>
            {t.action && (
              <button className="shrink-0 font-semibold underline underline-offset-4" onClick={() => { t.action!.run(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Numeri che scorrono fino al valore ---------- */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(reducedMotion() ? target : 0)
  const from = useRef(reducedMotion() ? target : 0)
  useEffect(() => {
    if (reducedMotion()) { setValue(target); from.current = target; return }
    const start = performance.now(), a = from.current, diff = target - a
    if (Math.abs(diff) < 0.005) { setValue(target); return }
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      const v = a + diff * eased
      setValue(v)
      from.current = v
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

export function CountMoney({ value, round, className = '' }: { value: number; round?: boolean; className?: string }) {
  const v = useCountUp(value)
  return <span className={`num ${className}`}>{money(round ? Math.round(v) : v, round)}</span>
}

/* ---------- Piccoli componenti ---------- */
export function Money({ value, className = '', signed, round }: { value: number; className?: string; signed?: boolean; round?: boolean }) {
  const tone = signed ? (value > 0 ? 'text-pos' : value < 0 ? 'text-ink' : 'text-muted') : ''
  return <span className={`num ${tone} ${className}`}>{signed && value > 0 ? '+' : ''}{money(value, round)}</span>
}

/** Controllo a segmenti con indicatore che scorre sotto l'opzione scelta. */
export function Segmented<T extends string>({ value, onChange, options, className = '' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(value)}"]`)
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrap.current) ro.observe(wrap.current)
    const t = requestAnimationFrame(() => setReady(true))
    return () => { ro.disconnect(); cancelAnimationFrame(t) }
  }, [value, options.length])
  return (
    <div ref={wrap} className={`relative inline-flex rounded-full bg-sunken p-1 ${className}`} role="tablist">
      {pill && (
        <span aria-hidden className="absolute top-1 bottom-1 rounded-full bg-surface shadow-sm"
          style={{ left: pill.left, width: pill.width, transition: ready ? 'left .35s var(--ease-spring), width .35s var(--ease-spring)' : 'none' }} />
      )}
      {options.map((o) => (
        <button key={o.value} data-v={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`relative z-[1] rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${value === o.value ? 'text-ink' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Bar({ value, max, tone = 'brand', thin }: { value: number; max: number; tone?: 'brand' | 'warn' | 'neg' | 'gold'; thin?: boolean }) {
  const p = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const color = { brand: 'var(--brand)', warn: 'var(--gold)', neg: 'var(--neg)', gold: 'var(--gold)' }[tone]
  return (
    <div className={`w-full overflow-hidden rounded-full bg-sunken ${thin ? 'h-1.5' : 'h-2.5'}`}>
      <div className="bar-fill h-full rounded-full" style={{ width: `${p * 100}%`, background: color }} />
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rise rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.9rem] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-muted">{children}</span>
}

export function Spinner() {
  return <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" /></div>
}

/** Segnaposto mentre i dati arrivano: ha la forma della pagina, non uno spinner. */
export function SkeletonPage({ hero }: { hero?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Caricamento">
      <div className="skeleton h-9 w-48" />
      <div className="skeleton mt-2 h-4 w-64" />
      {hero && <div className="skeleton mt-6 h-64 w-full !rounded-[28px]" />}
      <div className="mt-6 grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 !rounded-3xl" />)}</div>
      <div className="mt-6 space-y-3">{[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3"><div className="skeleton h-10 w-10 !rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-1/2" /><div className="skeleton h-3 w-1/3" /></div><div className="skeleton h-4 w-16" /></div>
      ))}</div>
    </div>
  )
}

export const rise = (i: number) => ({ className: 'rise', style: { '--i': i } as React.CSSProperties })

export function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3"><div className="skeleton h-10 w-10 !rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-1/2" /><div className="skeleton h-3 w-1/3" /></div><div className="skeleton h-4 w-16" /></div>
      ))}
    </div>
  )
}
