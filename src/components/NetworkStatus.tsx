import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { useToast } from './ui'
import { flush, pendingCount } from '../lib/outbox'

/** Avvisa quando manca la connessione o un caricamento fallisce, e riprova al ritorno online. */
export function NetworkStatus() {
  const qc = useQueryClient()
  const toast = useToast()
  const [online, setOnline] = useState(navigator.onLine)
  const lastErr = useRef(0)

  useEffect(() => {
    const send = async () => {
      if (!pendingCount()) return
      const n = await flush()
      if (n) { toast(n === 1 ? 'Inviato il movimento salvato offline' : `Inviati ${n} movimenti salvati offline`); qc.invalidateQueries() }
    }
    send()
    const on = () => { setOnline(true); send().then(() => qc.invalidateQueries()) }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const unsub = qc.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'error' && navigator.onLine && Date.now() - lastErr.current > 8000) {
        lastErr.current = Date.now()
        toast('Non riesco a caricare i dati.', { tone: 'err', action: { label: 'Riprova', run: () => qc.invalidateQueries() } })
      }
    })
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); unsub() }
  }, [qc, toast])

  if (online) return null
  return (
    <div className="fade-enter fixed inset-x-0 top-0 z-[55] flex justify-center pt-safe" role="status">
      <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper shadow-lg">
        <WifiOff size={15} /> Sei offline: vedi gli ultimi dati caricati
      </span>
    </div>
  )
}
