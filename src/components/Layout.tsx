import { Outlet, useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom'
import {
  forwardRef, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type ComponentType, type ReactNode,
} from 'react'
import { House, ArrowLeftRight, Plus, Target, PieChart, GraduationCap, Upload, Settings, FileBarChart } from 'lucide-react'
import { BackCtx } from './back'
import { QuickAddProvider, useQuickAdd } from './QuickAdd'
import { NavLink } from './nav'
import { NetworkStatus } from './NetworkStatus'
import { useBankReturn } from './BankSetup'
import { SkeletonPage } from './ui'
import { haptic, reducedMotion } from '../lib/motion'
import Dashboard from '../pages/Dashboard'

/* ---------- Schede principali ---------- */
export const TABS = [
  { to: '/', label: 'Home', icon: House },
  { to: '/movimenti', label: 'Movimenti', icon: ArrowLeftRight },
  { to: '/patrimonio', label: 'Patrimonio', icon: PieChart },
  { to: '/piano', label: 'Piano', icon: Target },
] as const

const TAB_PAGES: ComponentType[] = [
  Dashboard,
  lazy(() => import('../pages/Transactions')),
  lazy(() => import('../pages/Networth')),
  lazy(() => import('../pages/Plan')),
]

const EXTRA = [
  { to: '/impara', label: 'Impara', icon: GraduationCap },
  { to: '/resoconto', label: 'Resoconto', icon: FileBarChart },
  { to: '/importa', label: 'Importa', icon: Upload },
  { to: '/impostazioni', label: 'Impostazioni', icon: Settings },
]

export const tabIndexOf = (pathname: string) => TABS.findIndex((t) => t.to === (pathname.replace(/\/+$/, '') || '/'))

const useIsMobile = () => {
  const q = '(max-width: 1023px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Sulle schede (desktop) il contenuto lo mostra il router; su mobile lo mostra il pager. */
export function TabRoute({ index }: { index: number }) {
  const mobile = useIsMobile()
  if (mobile) return null
  const Page = TAB_PAGES[index]
  return <Suspense fallback={<SkeletonPage />}><Page /></Suspense>
}

export function Layout() {
  const mobile = useIsMobile()
  const navigate = useNavigate()
  useBankReturn(useCallback(() => navigate('/impostazioni/collegamenti'), [navigate]))
  return (
    <QuickAddProvider>
      <NetworkStatus />
      {mobile ? <MobileShell /> : <DesktopShell />}
    </QuickAddProvider>
  )
}

/* ====================================================================== */
/* Desktop: barra laterale, contenuto con una dissolvenza leggera           */
/* ====================================================================== */
function DesktopShell() {
  const qa = useQuickAdd()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const back = useCallback((fallback = '/') => { if (history.length > 1) navigate(-1); else navigate(fallback) }, [navigate])

  return (
    <BackCtx.Provider value={{ back, target: null }}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="no-print sticky top-0 flex h-dvh flex-col border-r border-line px-4 py-6">
          <div className="mb-8 flex items-center gap-2.5 px-3">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-8 w-8" />
            <span className="text-xl font-semibold tracking-[-0.02em]">Soldi</span>
          </div>
          <button onClick={() => qa.open()} className="btn btn-primary mb-6 w-full py-3"><Plus size={18} /> Nuovo movimento</button>
          <nav className="flex flex-col gap-0.5">
            {TABS.map((l) => <SideLink key={l.to} {...l} end={l.to === '/'} />)}
            {EXTRA.slice(0, 2).map((l) => <SideLink key={l.to} {...l} />)}
          </nav>
          <nav className="mt-auto flex flex-col gap-0.5">
            {EXTRA.slice(2).map((l) => <SideLink key={l.to} {...l} />)}
          </nav>
        </aside>
        <main className="mx-auto w-full max-w-5xl min-w-0 px-8 pt-10 pb-16">
          <div key={pathname} className="page-fade"><Outlet /></div>
        </main>
      </div>
    </BackCtx.Provider>
  )
}

function SideLink({ to, label, icon: I, end }: { to: string; label: string; icon: typeof Plus; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${isActive ? 'bg-brand-soft text-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`}>
      <I size={19} strokeWidth={1.9} />
      <span>{label}</span>
    </NavLink>
  )
}

/* ====================================================================== */
/* Mobile: schede affiancate che scorrono col dito (scroll-snap nativo)     */
/* e pagine di dettaglio che entrano da destra, con gesto "indietro".       */
/* ====================================================================== */
type Layer = { id: string; path: string; el: ReactNode; phase: 'in' | 'idle' | 'out' }
const OUT_MS = 380

function MobileShell() {
  const qa = useQuickAdd()
  const location = useLocation()
  const navType = useNavigationType()
  const navigate = useNavigate()
  const outlet = useOutlet()
  const ti = tabIndexOf(location.pathname)

  const [tab, setTab] = useState(ti >= 0 ? ti : 0)
  const [layers, setLayers] = useState<Layer[]>(() => (ti < 0 ? [{ id: location.key, path: location.pathname, el: outlet, phase: 'idle' }] : []))
  const pagerRef = useRef<HTMLDivElement>(null)
  const layerRefs = useRef(new Map<string, HTMLDivElement>())

  // Ogni cambio di indirizzo aggiorna la pila delle pagine di dettaglio
  useLayoutEffect(() => {
    const path = location.pathname
    if (ti >= 0) {
      setTab(ti)
      setLayers((ls) => ls.length ? ls.map((l) => ({ ...l, phase: 'out' as const })) : ls)
      return
    }
    setLayers((ls) => {
      const live = ls.filter((l) => l.phase !== 'out')
      const at = live.findIndex((l) => l.path === path)
      if (at >= 0) {
        // Torno a una pagina già aperta: chiudo quelle sopra
        return ls.map((l) => {
          const li = live.indexOf(l)
          if (l.phase === 'out' || li < 0) return l
          if (li > at) return { ...l, phase: 'out' as const }
          if (li === at) return { ...l, el: outlet }
          return l
        })
      }
      const fresh: Layer = { id: location.key, path, el: outlet, phase: reducedMotion() ? 'idle' : 'in' }
      if (navType === 'REPLACE' && live.length) return [...ls.slice(0, ls.indexOf(live[live.length - 1])), fresh]
      return [...ls, fresh]
    })
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rimuove i livelli usciti a fine animazione
  useEffect(() => {
    if (!layers.some((l) => l.phase === 'out' || l.phase === 'in')) return
    const t = setTimeout(() => setLayers((ls) => ls.filter((l) => l.phase !== 'out').map((l) => (l.phase === 'in' ? { ...l, phase: 'idle' } : l))), OUT_MS)
    return () => clearTimeout(t)
  }, [layers])

  const live = layers.filter((l) => l.phase !== 'out')
  const depth = live.length

  const back = useCallback((fallback?: string) => {
    if (live.length > 1) navigate(live[live.length - 2].path)
    else if (live.length === 1) navigate(TABS[tab].to)
    else navigate(fallback ?? '/')
  }, [live, navigate, tab])

  // Gesto dal bordo sinistro per tornare indietro
  useEdgeBack(layerRefs, live, pagerRef, back)

  // Tap sulla barra di stato (app iOS): torna in cima
  useEffect(() => {
    const onTap = () => {
      const top = live.length ? layerRefs.current.get(live[live.length - 1].id) : pagerRef.current?.children[tab] as HTMLElement | undefined
      top?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('statusTap', onTap)
    return () => window.removeEventListener('statusTap', onTap)
  }, [live, tab])

  const goTab = useCallback((i: number) => {
    if (i === tab && !depth) {
      // Tap sulla scheda già attiva: torna in cima
      ;(pagerRef.current?.children[i] as HTMLElement | undefined)?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    haptic('tick')
    navigate(TABS[i].to)
  }, [tab, depth, navigate])

  return (
    <BackCtx.Provider value={{ back, target: live.length === 1 ? TABS[tab].label : null }}>
      <div className="fixed inset-0 overflow-hidden bg-paper">
        <Pager ref={pagerRef} index={tab} covered={depth > 0}
          onSettle={(i) => { if (i !== tab) { haptic('tick'); navigate(TABS[i].to, { replace: true }) } }} />
        <div aria-hidden className="status-scrim pointer-events-none fixed inset-x-0 top-0 z-20" />

        {layers.map((l, i) => {
          const liveIdx = live.indexOf(l)
          const under = liveIdx >= 0 && liveIdx < live.length - 1
          return (
            <div key={l.id} ref={(el) => { if (el) layerRefs.current.set(l.id, el); else layerRefs.current.delete(l.id) }}
              className={`push-layer ${l.phase === 'in' ? 'push-in' : l.phase === 'out' ? 'push-out' : ''} ${under ? 'is-under' : ''}`}
              style={{ zIndex: 30 + i }}>
              <BackCtx.Provider value={{
                back: () => navigate(liveIdx > 0 ? live[liveIdx - 1].path : TABS[tab].to),
                target: liveIdx <= 0 ? TABS[tab].label : null,
              }}>
                <div className="mx-auto w-full max-w-2xl px-4 pt-safe pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
                  <div className="pt-3">{l.el}</div>
                </div>
              </BackCtx.Provider>
            </div>
          )
        })}

        <TabBar active={tab} hidden={depth > 0} onTab={goTab} onAdd={() => { haptic('light'); qa.open() }} />
      </div>
    </BackCtx.Provider>
  )
}

/* ---------- Pager orizzontale ---------- */

const Pager = forwardRef<HTMLDivElement, { index: number; covered: boolean; onSettle: (i: number) => void }>(function Pager({ index, covered, onSettle }, ref) {
  const inner = useRef<HTMLDivElement>(null)
  const settle = useRef(onSettle)
  settle.current = onSettle
  const indexRef = useRef(index)
  const first = useRef(true)
  // Le schede si montano alla prima visita e poi restano vive (scroll e filtri non si perdono)
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([index]))

  const setRef = (el: HTMLDivElement | null) => {
    inner.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  // Indice cambiato da fuori (tap sulla barra, link): scorro alla scheda
  useLayoutEffect(() => {
    indexRef.current = index
    setMounted((m) => (m.has(index) ? m : new Set([...m, index])))
    const el = inner.current
    if (!el) return
    const w = el.clientWidth
    if (Math.round(el.scrollLeft / w) === index && !first.current) return
    const far = Math.abs(el.scrollLeft / w - index) > 1.2
    if (far && !first.current) {
      document.documentElement.dataset.jump = '1'
      setTimeout(() => { delete document.documentElement.dataset.jump }, 380)
    }
    el.scrollTo({ left: index * w, behavior: first.current || far || reducedMotion() ? 'instant' : 'smooth' })
    if (first.current) document.documentElement.style.setProperty('--tab-p', String(index))
    first.current = false
  }, [index])

  // Dopo il primo disegno preparo anche le schede vicine
  useEffect(() => {
    const id = setTimeout(() => setMounted((m) => new Set([...m, index - 1, index + 1].filter((i) => i >= 0 && i < TABS.length).concat([...m]))), 600)
    return () => clearTimeout(id)
  }, [index])

  useEffect(() => {
    const el = inner.current
    if (!el) return
    let t = 0
    const root = document.documentElement
    const onScroll = () => {
      const p = el.scrollLeft / el.clientWidth
      root.style.setProperty('--tab-p', p.toFixed(4))
      const near = Math.round(p)
      if (Math.abs(p - near) < 0.25) setMounted((m) => (m.has(near) ? m : new Set([...m, near])))
      clearTimeout(t)
      t = window.setTimeout(done, 90)
    }
    const done = () => {
      const p = el.scrollLeft / el.clientWidth
      const i = Math.round(p)
      if (Math.abs(p - i) < 0.02 && i !== indexRef.current) settle.current(i)
    }
    const onResize = () => el.scrollTo({ left: indexRef.current * el.clientWidth, behavior: 'instant' })
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', done)
    window.addEventListener('resize', onResize)
    return () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('scrollend', done); window.removeEventListener('resize', onResize); clearTimeout(t) }
  }, [])

  return (
    <div ref={setRef} className={`pager ${covered ? 'is-under' : ''}`}>
      {TABS.map((t, i) => {
        const Page = TAB_PAGES[i]
        return (
          <section key={t.to} className="pane" aria-label={t.label} aria-hidden={i !== index}>
            <div className="mx-auto w-full max-w-2xl px-4 pt-safe pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
              <div className="pt-4">
                {mounted.has(i) ? <Suspense fallback={<SkeletonPage />}><Page /></Suspense> : <SkeletonPage />}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
})

/* ---------- Gesto dal bordo per tornare indietro ---------- */
function useEdgeBack(
  layerRefs: React.RefObject<Map<string, HTMLDivElement>>,
  live: Layer[],
  pagerRef: React.RefObject<HTMLDivElement | null>,
  back: () => void,
) {
  const state = useRef({ live, back })
  state.current = { live, back }
  useEffect(() => {
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, mode: 'off' | 'pending' | 'drag' = 'off'
    let top: HTMLDivElement | undefined, below: HTMLElement | undefined
    const ease = 'transform .36s cubic-bezier(.32,.72,0,1)'
    const set = (x: number, anim: boolean) => {
      const w = window.innerWidth
      if (top) { top.style.transition = anim ? ease : 'none'; top.style.transform = `translate3d(${x}px,0,0)` }
      if (below) { below.style.transition = anim ? `${ease}, filter .36s` : 'none'; below.style.transform = `translate3d(${-w * 0.25 * (1 - x / w)}px,0,0)`; below.style.filter = `brightness(${0.94 + 0.06 * (x / w)})` }
    }
    const clear = () => {
      ;[top, below].forEach((el) => { if (el) { el.style.transition = ''; el.style.transform = ''; el.style.filter = '' } })
      top = below = undefined
    }
    const onStart = (e: TouchEvent) => {
      const { live } = state.current
      if (!live.length || e.touches.length !== 1 || e.touches[0].clientX > 28) return
      const t = e.touches[0]
      x0 = t.clientX; y0 = t.clientY; t0 = performance.now(); dx = 0; mode = 'pending'
      top = layerRefs.current?.get(live[live.length - 1].id)
      below = live.length > 1 ? layerRefs.current?.get(live[live.length - 2].id) : pagerRef.current ?? undefined
    }
    const onMove = (e: TouchEvent) => {
      if (mode === 'off') return
      const t = e.touches[0]
      const mx = t.clientX - x0, my = t.clientY - y0
      if (mode === 'pending') {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return
        if (mx <= 0 || Math.abs(my) > Math.abs(mx)) { mode = 'off'; return }
        mode = 'drag'
      }
      e.preventDefault()
      dx = Math.max(0, mx)
      set(dx, false)
    }
    const onEnd = () => {
      if (mode !== 'drag') { mode = 'off'; return }
      mode = 'off'
      const w = window.innerWidth
      const v = dx / Math.max(1, performance.now() - t0)
      if (dx > w * 0.35 || v > 0.5) {
        set(w, true)
        const done = top
        setTimeout(() => {
          if (done) done.dataset.gone = '1'
          state.current.back()
          requestAnimationFrame(clear)
        }, 300)
      } else {
        set(0, true)
        setTimeout(clear, 360)
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [layerRefs, pagerRef])
}

/* ---------- Barra in basso ---------- */
function TabBar({ active, hidden, onTab, onAdd }: { active: number; hidden: boolean; onTab: (i: number) => void; onAdd: () => void }) {
  const cols = [0, 1, null, 2, 3] as const
  return (
    <nav className={`tabbar no-print ${hidden ? 'is-hidden' : ''}`} aria-label="Navigazione">
      <div className="tabbar-inner">
        <span aria-hidden className="tabbar-pill" />
        {cols.map((i) => i === null ? (
          <div key="add" className="flex items-center justify-center">
            <button onClick={onAdd} aria-label="Nuovo movimento" className="tabbar-add"><Plus size={24} strokeWidth={2.4} /></button>
          </div>
        ) : (
          <TabButton key={TABS[i].to} i={i} active={i === active} onTab={onTab} />
        ))}
      </div>
    </nav>
  )
}

function TabButton({ i, active, onTab }: { i: number; active: boolean; onTab: (i: number) => void }) {
  const { label, icon: I } = TABS[i]
  return (
    <button onClick={() => onTab(i)} aria-current={active ? 'page' : undefined}
      className={`tabbar-btn ${active ? 'is-active' : ''}`}>
      <I size={22} strokeWidth={active ? 2.3 : 1.8} />
      <span>{label}</span>
    </button>
  )
}
