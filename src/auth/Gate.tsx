import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { Delete, Eye, EyeOff } from 'lucide-react'
import { supabase, OWNER_EMAIL } from '../lib/supabase'
import { checkPin, hasPin, lockMinutes, pinSkipped, setPin, skipPin } from './pin'
import { Guilloche } from '../components/Guilloche'

export function Gate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [locked, setLocked] = useState(hasPin())
  const [needsPinSetup, setNeedsPinSetup] = useState(false)
  const last = useRef(Date.now())
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s)
      // All'uscita i dati salvati sul dispositivo vengono cancellati
      if (e === 'SIGNED_OUT') { qc.clear(); localStorage.removeItem('soldi-cache') }
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  // Blocco automatico per inattività o app in background
  useEffect(() => {
    if (!session) return
    const bump = () => { last.current = Date.now() }
    const check = () => { if (hasPin() && Date.now() - last.current > lockMinutes() * 60_000) setLocked(true) }
    const onVis = () => { if (document.visibilityState === 'visible') check(); else bump() }
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    document.addEventListener('visibilitychange', onVis)
    const t = setInterval(check, 30_000)
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); document.removeEventListener('visibilitychange', onVis); clearInterval(t) }
  }, [session])

  if (session === undefined) return <Splash />
  if (!session) return <Login onDone={() => { setLocked(false); if (!hasPin() && !pinSkipped()) setNeedsPinSetup(true) }} />
  if (needsPinSetup) return <PinSetup onDone={() => setNeedsPinSetup(false)} />
  if (locked && hasPin()) return <PinLock onUnlock={() => { last.current = Date.now(); setLocked(false) }} />
  return <>{children}</>
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center bg-paper"><div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" /></div>
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-note px-6 text-note-ink">
      <Guilloche className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] opacity-40" />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  )
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password: pw.trim() })
    setBusy(false)
    if (error) setErr(!navigator.onLine || error.status === 0 || /fetch|network/i.test(error.message)
      ? 'Nessuna connessione. Controlla internet e riprova.'
      : error.status === 429 ? 'Troppi tentativi. Aspetta qualche minuto e riprova.'
      : 'Chiave di accesso non corretta. Controlla maiuscole e trattini.')
    else onDone()
  }
  return (
    <Shell>
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Soldi</h1>
      <p className="mt-2 opacity-75">Su questo dispositivo serve la chiave di accesso una sola volta. Poi basta il PIN.</p>
      <form onSubmit={submit} className="mt-8 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm opacity-75">Chiave di accesso</span>
          <div className="relative">
            <input autoFocus type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password" placeholder="xxxxx-xxxxx-xxxxx-xxxxx"
              className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 pr-12 text-note-ink placeholder:text-note-ink/40 outline-none focus:border-white/50" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-70" aria-label={show ? 'Nascondi' : 'Mostra'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        {err && <p className="text-sm text-[#ffb4ab]">{err}</p>}
        <button disabled={busy || !pw} className="btn w-full bg-note-ink py-3.5 text-note">{busy ? 'Accesso…' : 'Entra'}</button>
      </form>
    </Shell>
  )
}

function PinPad({ title, subtitle, onComplete, error }: { title: string; subtitle?: string; onComplete: (pin: string) => void; error?: string }) {
  const [pin, setPinVal] = useState('')
  const LEN = 5
  const press = (d: string) => {
    if (pin.length >= LEN) return
    const next = pin + d
    setPinVal(next)
    if (next.length === LEN) setTimeout(() => { onComplete(next); setPinVal('') }, 120)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      if (e.key === 'Backspace') setPinVal((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 opacity-75">{subtitle}</p>}
        <div className={`mt-8 flex justify-center gap-4 ${error ? 'animate-[shake_.3s]' : ''}`} aria-label={`${pin.length} cifre inserite`}>
          {Array.from({ length: LEN }).map((_, i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-full border border-note-ink/60 transition ${i < pin.length ? 'bg-note-ink' : ''}`} />
          ))}
        </div>
        <p className="mt-4 h-5 text-sm text-[#ffb4ab]">{error}</p>
        <div className="mx-auto mt-4 grid max-w-[260px] grid-cols-3 gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)} className="num aspect-square rounded-full bg-white/8 text-2xl font-medium hover:bg-white/15 active:bg-white/25">{d}</button>
          ))}
          <span />
          <button onClick={() => press('0')} className="num aspect-square rounded-full bg-white/8 text-2xl font-medium hover:bg-white/15 active:bg-white/25">0</button>
          <button onClick={() => setPinVal((p) => p.slice(0, -1))} className="flex aspect-square items-center justify-center rounded-full opacity-80 hover:bg-white/10" aria-label="Cancella"><Delete /></button>
        </div>
      </div>
    </Shell>
  )
}

function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)
  return (
    <PinPad title="Inserisci il PIN" error={err} onComplete={async (p) => {
      if (await checkPin(p)) onUnlock()
      else {
        const t = tries + 1
        setTries(t)
        if (t >= 8) { await supabase.auth.signOut(); localStorage.removeItem('soldi-pin'); location.reload() }
        else setErr(`PIN errato. ${8 - t} tentativi prima di dover reinserire la chiave.`)
      }
    }} />
  )
}

export function PinSetup({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null)
  const [err, setErr] = useState('')
  return (
    <div className="relative">
      <PinPad
        title={first ? 'Conferma il PIN' : 'Scegli un PIN'}
        subtitle={first ? 'Riscrivilo per sicurezza.' : '5 cifre per aprire l\'app su questo dispositivo.'}
        error={err}
        onComplete={async (p) => {
          if (!first) { setFirst(p); setErr(''); return }
          if (p !== first) { setFirst(null); setErr('I due PIN non coincidono. Ricomincia.'); return }
          await setPin(p); onDone()
        }}
      />
      <button onClick={() => { skipPin(); onDone() }} className="fixed bottom-8 left-1/2 -translate-x-1/2 text-sm text-note-ink/70 underline underline-offset-4">
        Non ora
      </button>
    </div>
  )
}
