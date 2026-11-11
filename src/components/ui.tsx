import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { money } from '../lib/format'

/* ---------- Sheet (pannello dal basso su mobile, finestra su desktop) ---------- */
export function Sheet({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fade-enter absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`sheet-enter relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-surface pb-safe shadow-2xl sm:rounded-[24px] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-5 pt-4 pb-2 backdrop-blur">
          <div className="mx-auto h-1 w-10 rounded-full bg-line sm:hidden absolute left-1/2 top-2 -translate-x-1/2" />
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-sunken" aria-label="Chiudi"><X size={20} /></button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}

/* ---------- Toast ---------- */
type ToastT = { id: number; text: string; tone: 'ok' | 'err'; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(text: string, opts?: { tone?: 'ok' | 'err'; action?: ToastT['action'] }) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const push = useCallback((text: string, opts?: { tone?: 'ok' | 'err'; action?: ToastT['action'] }) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, text, tone: opts?.tone ?? 'ok', action: opts?.action }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), opts?.action ? 6000 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`sheet-enter pointer-events-auto flex items-center gap-4 rounded-full px-5 py-3 text-sm font-medium shadow-xl ${t.tone === 'err' ? 'bg-neg text-white' : 'bg-ink text-paper'}`}>
            <span>{t.text}</span>
            {t.action && (
              <button className="font-semibold underline underline-offset-4" onClick={() => { t.action!.run(); setItems((s) => s.filter((x) => x.id !== t.id)) }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Piccoli componenti ---------- */
export function Money({ value, className = '', signed, round }: { value: number; className?: string; signed?: boolean; round?: boolean }) {
  const tone = signed ? (value > 0 ? 'text-pos' : value < 0 ? 'text-ink' : 'text-muted') : ''
  return <span className={`num ${tone} ${className}`}>{signed && value > 0 ? '+' : ''}{money(value, round)}</span>
}

export function Segmented<T extends string>({ value, onChange, options, className = '' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string
}) {
  return (
    <div className={`inline-flex rounded-full bg-sunken p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Bar({ value, max, tone = 'brand', thin }: { value: number; max: number; tone?: 'brand' | 'warn' | 'neg' | 'gold'; thin?: boolean }) {
  const p = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const color = { brand: 'var(--brand)', warn: 'var(--gold)', neg: 'var(--neg)', gold: 'var(--gold)' }[tone]
  return (
    <div className={`w-full overflow-hidden rounded-full bg-sunken ${thin ? 'h-1.5' : 'h-2.5'}`}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p * 100}%`, background: color }} />
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.9rem] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-muted">{children}</span>
}

export function Spinner() {
  return <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" /></div>
}
