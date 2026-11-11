import { useEffect, type ComponentType } from 'react'
import { createHashRouter, RouterProvider, Navigate, type RouteObject } from 'react-router-dom'
import { Gate } from './auth/Gate'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ui'
import Dashboard from './pages/Dashboard'

// Le pagine si caricano prima della transizione, così l'animazione non mostra mai uno spinner
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default })

const loaders = {
  movimenti: () => import('./pages/Transactions'),
  conti: () => import('./pages/Accounts'),
  conto: () => import('./pages/AccountDetail'),
  piano: () => import('./pages/Plan'),
  impara: () => import('./pages/Learn'),
  lezione: () => import('./pages/Lesson'),
  importa: () => import('./pages/Import'),
  impostazioni: () => import('./pages/Settings'),
}

const routes: RouteObject[] = [{
  element: <Layout />,
  children: [
    { index: true, element: <Dashboard /> },
    { path: 'movimenti', lazy: page(loaders.movimenti) },
    { path: 'conti', lazy: page(loaders.conti) },
    { path: 'conti/:id', lazy: page(loaders.conto) },
    { path: 'piano', lazy: page(loaders.piano) },
    { path: 'impara', lazy: page(loaders.impara) },
    { path: 'impara/:lessonId', lazy: page(loaders.lezione) },
    { path: 'importa', lazy: page(loaders.importa) },
    { path: 'impostazioni', lazy: page(loaders.impostazioni) },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
}]

const router = createHashRouter(routes)

/** Precarica tutte le sezioni quando il browser è libero. */
function Prefetch() {
  useEffect(() => {
    const run = () => Object.values(loaders).forEach((l) => l().catch(() => {}))
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(run)
    else setTimeout(run, 1500)
  }, [])
  return null
}

export default function App() {
  return (
    <ToastProvider>
      <Gate>
        <Prefetch />
        <RouterProvider router={router} />
      </Gate>
    </ToastProvider>
  )
}
