import { useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { haptic } from '../lib/motion'

/* Avvisi e suggerimenti da togliere col dito: trascinando a sinistra compare a destra
   la X rossa; oltre metà (o un colpo deciso) l'elemento sparisce, altrimenti resta
   aperto e la X si tocca. Il gesto orizzontale è dell'elemento, quello verticale della pagina. */
export function SwipeDismiss({ children, onDismiss, label = 'Rimuovi', className = '' }: { children: ReactNode; onDismiss: () => void; label?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const g = useRef<{ id: number; x0: number; y0: number; dx: number; base: number; t: number; lock: 'x' | 'y' | null } | null>(null)
  const moved = useRef(false)
  const [open, setOpen] = useState(false)
  const [gone, setGone] = useState(false)
  const REVEAL = 76

  const set = (x: number, anim: boolean) => {
    const el = row.current
    if (!el) return
    el.style.transition = anim ? 'transform .38s var(--ease-spring)' : 'none'
    el.style.transform = `translate3d(${x}px,0,0)`
    box.current?.style.setProperty('--sd', String(Math.min(1, -x / REVEAL)))
  }
  const dismiss = () => {
    haptic('light')
    const w = box.current?.offsetWidth ?? 400
    const el = row.current
    if (el) { el.style.transition = 'transform .26s cubic-bezier(.4,0,1,1)'; el.style.transform = `translate3d(${-w}px,0,0)` }
    // Poi la riga si richiude in altezza e il resto della lista sale
    setTimeout(() => {
      const b = box.current
      if (b) { b.style.height = `${b.offsetHeight}px`; requestAnimationFrame(() => { b.style.transition = 'height .28s var(--ease-ios), opacity .2s ease'; b.style.height = '0px'; b.style.opacity = '0' }) }
      setTimeout(() => { setGone(true); onDismiss() }, 300)
    }, 200)
  }

  if (gone) return null
  return (
    <div ref={box} className={`swipe-x ${className}`} style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        moved.current = false
        g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, base: open ? -REVEAL : 0, t: performance.now(), lock: null }
      }}
      onPointerMove={(e) => {
        const s = g.current
        if (!s || s.id !== e.pointerId) return
        const dx = e.clientX - s.x0, dy = e.clientY - s.y0
        if (!s.lock) {
          if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return
          s.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
          if (s.lock === 'x') { moved.current = true; box.current?.setPointerCapture?.(e.pointerId) }
        }
        if (s.lock !== 'x') return
        let x = s.base + dx
        // Verso destra fa resistenza, verso sinistra segue il dito
        if (x > 0) x = x * 0.25
        s.dx = dx
        set(x, false)
        if (s.base === 0 && x < -REVEAL && !open) { setOpen(true); haptic('tick') }
      }}
      onPointerUp={(e) => {
        const s = g.current
        g.current = null
        if (!s || s.id !== e.pointerId || s.lock !== 'x') return
        const x = s.base + s.dx
        const v = s.dx / Math.max(1, performance.now() - s.t)
        const w = box.current?.offsetWidth ?? 400
        if (x < -w * 0.5 || (v < -0.9 && x < -REVEAL * 0.6)) return dismiss()
        if (x < -REVEAL * 0.55) { setOpen(true); set(-REVEAL, true) } else { setOpen(false); set(0, true) }
      }}
      onPointerCancel={() => { g.current = null; set(open ? -REVEAL : 0, true) }}
      onClickCapture={(e) => {
        // Dopo un trascinamento il tocco non apre la riga; con la X visibile la richiude
        if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; return }
        if (open && !(e.target as HTMLElement).closest('.swipe-x-btn')) { e.preventDefault(); e.stopPropagation(); setOpen(false); set(0, true) }
      }}>
      <button type="button" className="swipe-x-btn" aria-label={label} onClick={dismiss} tabIndex={open ? 0 : -1}>
        <X size={20} strokeWidth={2.6} />
      </button>
      <div ref={row} className="swipe-x-row">{children}</div>
    </div>
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
