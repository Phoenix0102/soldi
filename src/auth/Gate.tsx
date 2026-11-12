import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { Delete, Eye, EyeOff, ScanFace } from 'lucide-react'
import { bioAvailable, bioEnabled, enableBio, verifyBio } from '../lib/biometric'
import { isNative } from '../lib/native'
import { haptic } from '../lib/motion'
import { supabase, OWNER_EMAIL } from '../lib/supabase'
import { checkPin, hasPin, lockMinutes, PIN_LEN, pinLength, pinSkipped, setPin, skipPin } from './pin'
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
  if (needsPinSetup) return <PinSetup upgrade={hasPin()} onDone={() => setNeedsPinSetup(false)} />
  // Il blocco si sovrappone all'app senza smontarla: sbloccando ritrovi tutto dov'era
  return (
    <>
      <div aria-hidden={locked && hasPin()} className={locked && hasPin() ? 'pointer-events-none' : ''}>{children}</div>
      {locked && hasPin() && <div className="fixed inset-0 z-[80]"><PinLock onUnlock={() => {
        last.current = Date.now(); setLocked(false)
        // PIN di 5 cifre della versione precedente: chiedo quello nuovo da 4
        if (pinLength() !== PIN_LEN) setNeedsPinSetup(true)
      }} /></div>}
    </>
  )
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center bg-paper"><div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" /></div>
}

function Shell({ children }: { children: ReactNode }) {
  // Sfondo scuro: nell'app iOS la barra di stato passa al testo chiaro
  useEffect(() => {
    document.documentElement.dataset.statusbar = 'light'
    return () => { delete document.documentElement.dataset.statusbar }
  }, [])
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

function PinPad({ title, subtitle, onComplete, error, extra, length = PIN_LEN }: { title: string; subtitle?: string; onComplete: (pin: string) => void; error?: string; extra?: ReactNode; length?: number }) {
  const [pin, setPinVal] = useState('')
  const LEN = length
  const press = (d: string) => {
    if (pin.length >= LEN) return
    haptic('tick')
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
        <div key={error} className={`mt-8 flex justify-center gap-5 ${error ? 'animate-[shake_.35s]' : ''}`} aria-label={`${pin.length} cifre inserite`}>
          {Array.from({ length: LEN }).map((_, i) => (
            <span key={i} className={`pin-dot ${i < pin.length ? 'is-on' : ''}`} />
          ))}
        </div>
        <p className="mt-4 h-5 text-sm text-[#ffb4ab]">{error}</p>
        <div className="mx-auto mt-4 grid max-w-[260px] grid-cols-3 gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)} className="pin-key num">{d}</button>
          ))}
          {extra ?? <span />}
          <button onClick={() => press('0')} className="pin-key num">0</button>
          <button onClick={() => setPinVal((p) => p.slice(0, -1))} className="flex aspect-square items-center justify-center rounded-full opacity-80 hover:bg-white/10" aria-label="Cancella"><Delete /></button>
        </div>
      </div>
    </Shell>
  )
}

function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)
  const [bio, setBio] = useState(false)
  const tried = useRef(false)
  const tryBio = async () => { if (await verifyBio()) { haptic('success'); onUnlock() } }
  // Face ID parte da solo all'apertura; se lo annulli resta il pulsante accanto allo 0
  useEffect(() => {
    if (!bioEnabled()) return
    bioAvailable().then((ok) => {
      setBio(ok)
      if (ok && !tried.current) { tried.current = true; tryBio() }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PinPad title="Bentornato" subtitle={bio ? 'Usa Face ID o inserisci il PIN' : 'Inserisci il PIN'} error={err} length={pinLength()}
      extra={bio ? <button onClick={tryBio} className="pin-key !bg-transparent" aria-label="Sblocca con Face ID"><ScanFace size={30} /></button> : undefined}
      onComplete={async (p) => {
      if (await checkPin(p)) { haptic('success'); onUnlock() }
      else {
        haptic('warning')
        const t = tries + 1
        setTries(t)
        if (t >= 8) { await supabase.auth.signOut(); localStorage.removeItem('soldi-pin'); location.reload() }
        else setErr(`PIN errato. ${8 - t} tentativi prima di dover reinserire la chiave.`)
      }
    }} />
  )
}

export function PinSetup({ onDone, upgrade }: { onDone: () => void; upgrade?: boolean }) {
  const [first, setFirst] = useState<string | null>(null)
  const [err, setErr] = useState('')
  return (
    <div className="relative">
      <PinPad
        title={first ? 'Conferma il PIN' : upgrade ? 'Nuovo PIN a 4 cifre' : 'Scegli un PIN'}
        subtitle={first ? 'Riscrivilo per sicurezza.' : upgrade ? 'Il PIN ora è più corto: scegline uno nuovo.' : '4 cifre per aprire l\'app su questo dispositivo.'}
        error={err}
        onComplete={async (p) => {
          if (!first) { setFirst(p); setErr(''); return }
          if (p !== first) { haptic('warning'); setFirst(null); setErr('I due PIN non coincidono. Ricomincia.'); return }
          await setPin(p)
          haptic('success')
          // Nell'app attivo subito Face ID: iOS chiede il permesso la prima volta
          if (isNative() && bioEnabled() && await bioAvailable()) await enableBio().catch(() => {})
          onDone()
        }}
      />
      {!upgrade && <button onClick={() => { skipPin(); onDone() }} className="fixed bottom-8 left-1/2 -translate-x-1/2 text-sm text-note-ink/70 underline underline-offset-4">
        Non ora
      </button>}
    </div>
  )
}
