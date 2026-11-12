import { createContext, useContext } from 'react'
import { ChevronLeft } from 'lucide-react'

/* ---------- "Indietro" dalle pagine di dettaglio ---------- */
type Back = { back: (fallback?: string) => void; /** Nome della scheda a cui si torna, se è una scheda */ target: string | null }
export const BackCtx = createContext<Back>({ back: () => {}, target: null })
/** Torna alla schermata precedente (o a `fallback` se la pagina è stata aperta direttamente). */
export const useBack = () => useContext(BackCtx).back

export function BackButton({ label, fallback = '/', always }: { label: string; fallback?: string; always?: boolean }) {
  const { back, target } = useContext(BackCtx)
  return (
    <button onClick={() => back(fallback)} className={`press -ml-2 mb-3 inline-flex items-center gap-0.5 rounded-full py-1.5 pr-3 pl-1 font-medium text-brand ${always ? '' : 'lg:hidden'}`}>
      <ChevronLeft size={22} strokeWidth={2.2} /> {target ?? label}
    </button>
  )
}

