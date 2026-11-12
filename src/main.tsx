import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import './index.css'
import { applyTheme } from './lib/theme'
import { initNative } from './lib/native'
import { refreshNativeToken } from './lib/push'
import App from './App'

applyTheme()
initNative().then(refreshNativeToken)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 7 * 24 * 3600_000, refetchOnWindowFocus: true, retry: 2, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst' },
  },
})

// I dati restano sul dispositivo: l'app si apre subito con gli ultimi valori e si aggiorna in background
export const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'soldi-cache', throttleTime: 1500 })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 3600_000, buster: 'v2' }}>
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)
