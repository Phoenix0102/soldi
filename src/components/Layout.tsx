import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { LayoutGrid, List, Plus, Target, GraduationCap, Wallet, Upload, Settings } from 'lucide-react'
import { useQuickAdd } from './QuickAdd'

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
  const qa = useQuickAdd()
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  // Scorciatoia da tastiera: "n" apre un nuovo movimento
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) { e.preventDefault(); qa.open() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qa])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar desktop */}
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

      <main className="mx-auto w-full max-w-5xl px-5 pt-safe pb-32 sm:px-8 lg:pb-16">
        <div className="pt-6 lg:pt-10"><Outlet /></div>
      </main>

      {/* Barra mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-safe backdrop-blur-lg lg:hidden" aria-label="Navigazione">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2">
          {MAIN.slice(0, 2).map((l) => <TabLink key={l.to} {...l} />)}
          <div className="flex justify-center">
            <button onClick={() => qa.open()} aria-label="Nuovo movimento"
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg shadow-brand/30 active:scale-95">
              <Plus size={26} />
            </button>
          </div>
          {MAIN.slice(2).map((l) => <TabLink key={l.to} {...l} />)}
        </div>
      </nav>
    </div>
  )
}

type L = { to: string; label: string; icon: typeof Plus; end?: boolean }
function SideLink({ to, label, icon: I, end }: L) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition ${isActive ? 'bg-brand-soft text-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`}>
      <I size={19} strokeWidth={1.9} /> {label}
    </NavLink>
  )
}
function TabLink({ to, label, icon: I, end }: L) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium ${isActive ? 'text-ink' : 'text-faint'}`}>
      {({ isActive }) => (<><I size={22} strokeWidth={isActive ? 2.3 : 1.8} />{label}</>)}
    </NavLink>
  )
}
