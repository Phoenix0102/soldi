import { useEffect, useRef, type RefObject } from 'react'
import { reducedMotion } from './motion'

export const SWIPE_TABS = ['/', '/movimenti', '/piano', '/impara']

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Vero se il dito parte da un elemento che deve gestire da sé il trascinamento orizzontale. */
function blocked(target: EventTarget | null, root: HTMLElement) {
  let el = target as HTMLElement | null
  while (el && el !== root) {
    if (el.matches('input, textarea, select, [role="dialog"], [data-no-swipe], .recharts-wrapper')) return true
    const cs = getComputedStyle(el)
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) return true
    el = el.parentElement
  }
  return false
}

/**
 * Scorrimento col dito tra le sezioni principali: la pagina segue il dito,
 * al rilascio passa alla sezione accanto oppure torna al suo posto.
 */
export function useSwipeTabs(
  area: RefObject<HTMLElement | null>,
  page: RefObject<HTMLElement | null>,
  pathname: string,
  go: (to: string, dir: 'left' | 'right') => void,
) {
  const state = useRef({ pathname, go })
  state.current = { pathname, go }

  useEffect(() => {
    const root = area.current
    if (!root) return
    let x0 = 0, y0 = 0, t0 = 0, dx = 0
    let mode: 'idle' | 'pending' | 'swipe' | 'scroll' = 'idle'
    let index = -1

    const setPage = (x: number, animate: boolean) => {
      const el = page.current
      if (!el) return
      el.style.transition = animate ? 'transform .32s cubic-bezier(.32,.72,0,1), opacity .32s ease' : 'none'
      el.style.transform = x ? `translate3d(${x}px,0,0)` : ''
      el.style.opacity = x ? String(Math.max(0.55, 1 - Math.abs(x) / (window.innerWidth * 1.4))) : ''
    }

    const onStart = (e: TouchEvent) => {
      mode = 'idle'
      if (window.innerWidth >= 1024 || e.touches.length !== 1) return
      index = SWIPE_TABS.indexOf(state.current.pathname)
      if (index < 0) return
      const t = e.touches[0]
      // Safari nel browser usa il bordo sinistro per "indietro": lo lascio libero
      if (isIOS() && !isStandalone() && t.clientX < 24) return
      if (blocked(e.target, root)) return
      x0 = t.clientX; y0 = t.clientY; t0 = performance.now(); dx = 0
      mode = 'pending'
    }

    const onMove = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'scroll') return
      const t = e.touches[0]
      const mx = t.clientX - x0, my = t.clientY - y0
      if (mode === 'pending') {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
        // Il gesto diventa uno swipe solo se è chiaramente orizzontale
        mode = Math.abs(mx) > Math.abs(my) * 1.3 ? 'swipe' : 'scroll'
        if (mode === 'scroll') return
      }
      e.preventDefault()
      const hasNext = mx < 0 ? index < SWIPE_TABS.length - 1 : index > 0
      dx = hasNext ? mx : mx * 0.25 // resistenza ai bordi
      setPage(dx, false)
    }

    const onEnd = () => {
      if (mode !== 'swipe') { mode = 'idle'; return }
      mode = 'idle'
      const w = window.innerWidth
      const v = dx / Math.max(1, performance.now() - t0)
      const target = dx < 0 ? index + 1 : index - 1
      const enough = Math.abs(dx) > w * 0.28 || (Math.abs(dx) > 40 && Math.abs(v) > 0.45)
      if (enough && target >= 0 && target < SWIPE_TABS.length) {
        const dir = dx < 0 ? 'left' : 'right'
        if (reducedMotion()) { setPage(0, false); state.current.go(SWIPE_TABS[target], dir); return }
        setPage(dx < 0 ? -w * 0.45 : w * 0.45, true)
        const el = page.current
        if (el) el.style.opacity = '0'
        const old = page.current
        setTimeout(() => {
          state.current.go(SWIPE_TABS[target], dir)
          requestAnimationFrame(() => { if (old) { old.style.transition = 'none'; old.style.transform = ''; old.style.opacity = '' } })
        }, 140)
      } else {
        setPage(0, true)
      }
    }

    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: false })
    root.addEventListener('touchend', onEnd)
    root.addEventListener('touchcancel', onEnd)
    return () => {
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', onEnd)
    }
  }, [area, page])
}
