import { useEffect, type ComponentType } from 'react'
import { createHashRouter, RouterProvider, Navigate, type RouteObject } from 'react-router-dom'
import { Gate } from './auth/Gate'
import { setNavigator } from './lib/navigate'
import { Layout, TabRoute } from './components/Layout'
import { ToastProvider } from './components/ui'

// Le pagine si caricano prima della transizione, così l'animazione non mostra mai uno spinner
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default })

const loaders = {
  movimenti: () => import('./pages/Transactions'),
  patrimonio: () => import('./pages/Networth'),
  conto: () => import('./pages/AccountDetail'),
  piano: () => import('./pages/Plan'),
  impara: () => import('./pages/Learn'),
  lezione: () => import('./pages/Lesson'),
  importa: () => import('./pages/Import'),
  impostazioni: () => import('./pages/Settings'),
  smista: () => import('./pages/Triage'),
  resoconto: () => import('./pages/Report'),
  benvenuto: () => import('./pages/Welcome'),
}

const routes: RouteObject[] = [{
  element: <Layout />,
  children: [
    { index: true, element: <TabRoute index={0} /> },
    { path: 'movimenti', element: <TabRoute index={1} /> },
    { path: 'patrimonio', element: <TabRoute index={2} /> },
    { path: 'piano', element: <TabRoute index={3} /> },
    { path: 'conti', element: <Navigate to="/patrimonio" replace /> },
    { path: 'conti/:id', lazy: page(loaders.conto) },
    { path: 'impara', lazy: page(loaders.impara) },
    { path: 'impara/:lessonId', lazy: page(loaders.lezione) },
    { path: 'importa', lazy: page(loaders.importa) },
    { path: 'impostazioni', lazy: page(loaders.impostazioni) },
    { path: 'impostazioni/:section', lazy: page(loaders.impostazioni) },
    { path: 'smista', lazy: page(loaders.smista) },
    { path: 'resoconto', lazy: page(loaders.resoconto) },
    { path: 'benvenuto', lazy: page(loaders.benvenuto) },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
}]

const router = createHashRouter(routes)
setNavigator((to) => { router.navigate(to) })

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
