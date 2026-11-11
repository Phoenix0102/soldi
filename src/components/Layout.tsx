import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LayoutGrid, List, Plus, Target, GraduationCap, Wallet, Upload, Settings } from 'lucide-react'
import { QuickAddProvider, useQuickAdd } from './QuickAdd'
import { NavLink } from './nav'
import { NetworkStatus } from './NetworkStatus'
import { supportsViewTransitions } from '../lib/motion'
import { useSwipeTabs } from '../lib/useSwipeTabs'

const MAIN = [
  { to: '/', label: 'Home', icon: LayoutGrid, end: true },
  { to: '/movimenti', label: 'Movimenti', icon: List },
  { to: '/piano', label: 'Piano', icon: Target },
  { to: '/impara', label: 'Impara', icon: GraduationCap },
]
const EXTRA = [
  { to: '/conti', label: 'Conti', icon: Wallet },
  { to: '/importa', label: 'Importa', icon: Upload },
  { to: '/impostazioni', label: 'Impostazioni', icon: Settings },
]

export function Layout() {
  return <QuickAddProvider><Shell /></QuickAddProvider>
}

function Shell() {
  const qa = useQuickAdd()
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const vt = supportsViewTransitions()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  // Dopo uno swipe la nuova pagina entra dal lato verso cui si è trascinato
  const [swipe, setSwipe] = useState<{ path: string; dir: 'left' | 'right' } | null>(null)
  const go = useCallback((to: string, dir: 'left' | 'right') => { setSwipe({ path: to, dir }); navigate(to) }, [navigate])
  useSwipeTabs(mainRef, pageRef, pathname, go)

  // Torna in cima prima che la transizione fotografi la nuova pagina
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // Scorciatoia da tastiera: "n" apre un nuovo movimento
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); qa.open() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qa])

  // Senza View Transitions (o con il tasto indietro) uso un'entrata animata della pagina
  const swiped = swipe?.path === pathname
  const fallback = !vt || navType === 'POP' || swiped
  const enterClass = swiped ? (swipe!.dir === 'left' ? 'swipe-in-left' : 'swipe-in-right') : 'page-enter'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <NetworkStatus />
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-8 w-8" />
          <span className="text-xl font-semibold tracking-[-0.02em]">Soldi</span>
        </div>
        <button onClick={() => qa.open()} className="btn btn-primary mb-6 w-full py-3"><Plus size={18} /> Nuovo movimento</button>
        <nav className="flex flex-col gap-0.5">
          {[...MAIN.slice(0, 2), EXTRA[0], ...MAIN.slice(2)].map((l) => <SideLink key={l.to} {...l} />)}
        </nav>
        <nav className="mt-auto flex flex-col gap-0.5">
          {EXTRA.slice(1).map((l) => <SideLink key={l.to} {...l} />)}
        </nav>
      </aside>

      <main ref={mainRef} className="mx-auto w-full max-w-5xl min-w-0 px-4 pt-safe pb-32 sm:px-8 lg:pb-16">
        <div ref={pageRef} key={fallback ? pathname : 'vt'} className={`pt-6 lg:pt-10 ${fallback ? enterClass : ''}`} style={{ viewTransitionName: 'page' }}>
          <Outlet />
        </div>
      </main>

      <TabBar onAdd={() => qa.open()} />
    </div>
  )
}

type L = { to: string; label: string; icon: typeof Plus; end?: boolean }

function SideLink({ to, label, icon: I, end }: L) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors ${isActive ? 'text-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`}>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-0 rounded-xl bg-brand-soft" style={{ viewTransitionName: 'side-pill' }} />}
          <I size={19} strokeWidth={1.9} className="relative" />
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  )
}

/* Barra in basso: un solo indicatore che scivola sotto la tab attiva */
const TABS = [MAIN[0], MAIN[1], null, MAIN[2], MAIN[3]] as const

function TabBar({ onAdd }: { onAdd: () => void }) {
  const { pathname } = useLocation()
  const col = TABS.findIndex((t) => t && (t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + '/')))
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 pb-safe backdrop-blur-xl lg:hidden" aria-label="Navigazione" style={{ viewTransitionName: 'tabbar' }}>
      <div className="relative mx-auto grid max-w-md grid-cols-5 items-center px-2">
        <span aria-hidden className="tab-indicator pointer-events-none absolute top-1.5 left-2 flex h-8 justify-center"
          style={{ width: 'calc((100% - 1rem) / 5)', transform: `translateX(${Math.max(col, 0) * 100}%)`, opacity: col < 0 ? 0 : 1 }}>
          <span className="h-full w-14 rounded-full bg-brand-soft" />
        </span>
        {TABS.map((t, i) => t ? <TabLink key={t.to} {...t} active={i === col} /> : (
          <div key="add" className="flex justify-center">
            <button onClick={onAdd} aria-label="Nuovo movimento"
              className="fab -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg shadow-brand/30">
              <Plus size={26} />
            </button>
          </div>
        ))}
      </div>
    </nav>
  )
}

function TabLink({ to, label, icon: I, end, active }: L & { active: boolean }) {
  return (
    <NavLink to={to} end={end} aria-current={active ? 'page' : undefined}
      className={`tab-link relative flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium ${active ? 'text-ink' : 'text-faint'}`}>
      <I size={22} strokeWidth={active ? 2.2 : 1.8} className="tab-icon relative" />
      <span className="relative">{label}</span>
    </NavLink>
  )
}
