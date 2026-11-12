import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { haptic } from '../lib/motion'

/* Avvisi e suggerimenti da togliere col dito: trascinando a sinistra compare a destra
   la X rossa; oltre metà (o un colpo deciso) l'elemento sparisce, altrimenti resta
   aperto e la X si tocca. Il gesto orizzontale è dell'elemento, quello verticale della pagina. */
export function SwipeDismiss({ children, onDismiss, label = 'Rimuovi', className = '' }: { children: ReactNode | ((dismiss: () => void) => ReactNode); onDismiss: () => void; label?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const openRef = useRef(false)
  const moved = useRef(false)
  const [open, setOpenState] = useState(false)
  const [gone, setGone] = useState(false)
  const REVEAL = 76
  const setOpen = (v: boolean) => { openRef.current = v; setOpenState(v) }
  const dismissRef = useRef<() => void>(() => {})

  const set = (x: number, anim: boolean) => {
    const el = row.current
    if (!el) return
    el.style.transition = anim ? 'transform .38s var(--ease-spring)' : 'none'
    el.style.transform = x ? `translate3d(${x}px,0,0)` : ''
    box.current?.style.setProperty('--sd', String(Math.min(1, -x / REVEAL)))
  }
  const dismiss = () => {
    haptic('light')
    const w = box.current?.offsetWidth ?? 400
    const el = row.current
    if (el) { el.style.transition = 'transform .24s cubic-bezier(.4,0,1,1)'; el.style.transform = `translate3d(${-w}px,0,0)` }
    // Poi la riga si richiude in altezza e il resto della lista sale
    setTimeout(() => {
      const b = box.current
      if (b) { b.style.height = `${b.offsetHeight}px`; requestAnimationFrame(() => { b.style.transition = 'height .28s var(--ease-ios), opacity .2s ease'; b.style.height = '0px'; b.style.opacity = '0' }) }
      setTimeout(() => { setGone(true); onDismiss() }, 300)
    }, 180)
  }
  dismissRef.current = dismiss

  // Gesto con gli eventi touch nativi: appena il movimento è orizzontale lo blocco per la pagina
  // (niente cambio di scheda, niente scorrimento), quello verticale resta alla pagina.
  useEffect(() => {
    const el = box.current
    if (!el) return
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, base = 0, lock: 'x' | 'y' | null = null, active = false
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = performance.now(); dx = 0
      base = openRef.current ? -REVEAL : 0; lock = null; active = true; moved.current = false
    }
    const move = (e: TouchEvent) => {
      if (!active) return
      const t = e.touches[0]
      const mx = t.clientX - x0, my = t.clientY - y0
      if (!lock) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return
        lock = Math.abs(mx) > Math.abs(my) * 1.1 ? 'x' : 'y'
        if (lock === 'y') { active = false; return }
        moved.current = true
      }
      e.preventDefault(); e.stopPropagation()
      dx = mx
      let x = base + dx
      if (x > 0) x *= 0.25
      set(x, false)
      if (base === 0 && x < -REVEAL && !openRef.current) { setOpen(true); haptic('tick') }
    }
    const end = () => {
      if (!active) return
      active = false
      if (lock !== 'x') return
      const x = base + dx
      const v = dx / Math.max(1, performance.now() - t0)
      const w = el.offsetWidth
      if (x < -w * 0.45 || (v < -0.8 && x < -REVEAL * 0.6)) return dismissRef.current()
      if (x < -REVEAL * 0.5) { setOpen(true); set(-REVEAL, true) } else { setOpen(false); set(0, true) }
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [])

  if (gone) return null
  return (
    <div ref={box} className={`swipe-x ${className}`} data-no-swipe
      onClickCapture={(e) => {
        // Dopo un trascinamento il tocco non apre la riga; con la X visibile la richiude
        if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; return }
        if (open && !(e.target as HTMLElement).closest('.swipe-x-btn')) { e.preventDefault(); e.stopPropagation(); setOpen(false); set(0, true) }
      }}>
      <button type="button" className="swipe-x-btn" aria-label={label} onClick={dismiss} tabIndex={open ? 0 : -1}>
        <X size={20} strokeWidth={2.6} />
      </button>
      <div ref={row} className="swipe-x-row">{typeof children === 'function' ? children(dismiss) : children}</div>
    </div>
  )
}

/** X piccola e sempre visibile, per chi non conosce il gesto. */
export function DismissX({ onClick, label = 'Rimuovi' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      className="press -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
      <X size={15} strokeWidth={2.5} />
    </button>
  )
}

/* Elementi tolti dall'utente, ricordati su questo dispositivo */
const KEY = 'soldi-dismissed'
export function dismissedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]) } catch { return new Set() }
}
export function dismissKey(k: string) {
  const s = [...dismissedSet(), k].slice(-200)
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* pieno o non disponibile */ }
}
