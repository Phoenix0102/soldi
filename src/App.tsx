import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import { Gate } from './auth/Gate'
import { Layout } from './components/Layout'
import { QuickAddProvider } from './components/QuickAdd'
import { ToastProvider, Spinner } from './components/ui'
import Dashboard from './pages/Dashboard'
const Transactions = lazy(() => import('./pages/Transactions'))
const Accounts = lazy(() => import('./pages/Accounts'))
const AccountDetail = lazy(() => import('./pages/AccountDetail'))
const Plan = lazy(() => import('./pages/Plan'))
const Learn = lazy(() => import('./pages/Learn'))
const Lesson = lazy(() => import('./pages/Lesson'))
const Import = lazy(() => import('./pages/Import'))
const SettingsPage = lazy(() => import('./pages/Settings'))

export default function App() {
  return (
    <ToastProvider>
      <Gate>
        <HashRouter>
          <QuickAddProvider>
            <Suspense fallback={<Spinner />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="movimenti" element={<Transactions />} />
                <Route path="conti" element={<Accounts />} />
                <Route path="conti/:id" element={<AccountDetail />} />
                <Route path="piano" element={<Plan />} />
                <Route path="impara" element={<Learn />} />
                <Route path="impara/:lessonId" element={<Lesson />} />
                <Route path="importa" element={<Import />} />
                <Route path="impostazioni" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            </Suspense>
          </QuickAddProvider>
        </HashRouter>
      </Gate>
    </ToastProvider>
  )
}
