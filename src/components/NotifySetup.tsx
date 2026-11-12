import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAppSettings, useInvalidate } from '../lib/data'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, testPush } from '../lib/push'
import { useToast } from './ui'

const TYPES = [
  { key: 'scadenze', label: 'Scadenze', text: 'Il giorno prima e il giorno di un addebito ricorrente' },
  { key: 'budget', label: 'Budget', text: 'Quando una categoria arriva all\'80% e al 100%' },
  { key: 'resoconto', label: 'Resoconto', text: 'Il primo del mese, quando il resoconto è pronto' },
] as const

export function NotifySetup() {
  const { data: settings } = useAppSettings()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const prefs = { scadenze: true, budget: true, resoconto: true, ...((settings?.data?.notify as Record<string, boolean>) ?? {}) }
  const iosBrowser = isIOS() && !isStandalone()

  useEffect(() => { currentSubscription().then((s) => setOn(!!s)).catch(() => setOn(false)) }, [])

  const toggle = async () => {
    setBusy(true)
    try {
      if (on) { await disablePush(); setOn(false); toast('Notifiche disattivate su questo dispositivo') }
      else { await enablePush(); setOn(true); toast('Notifiche attive') }
    } catch (e) { toast((e as Error).message, { tone: 'err' }) }
    finally { setBusy(false) }
  }

  const setPref = async (key: string, value: boolean) => {
    const data = { ...(settings?.data ?? {}), notify: { ...prefs, [key]: value } }
    const { error } = await supabase.from('app_settings').upsert({ data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return toast('Non salvato', { tone: 'err' })
    invalidate('app_settings')
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Bell size={18} /> Notifiche</h2>
        <p className="text-sm text-muted">Arrivano ogni mattina alle 8 solo quando c'è qualcosa di utile.</p>
      </div>
      <div className="space-y-4 rounded-3xl bg-surface p-5">
        {!pushSupported() || iosBrowser ? (
          <p className="text-sm text-muted">
            {iosBrowser
              ? "Su iPhone le notifiche funzionano solo dall'app installata: in Safari tocca Condividi, poi \"Aggiungi alla schermata Home\", apri Soldi dall'icona e torna qui."
              : 'Questo browser non supporta le notifiche push.'}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={toggle} disabled={busy || on === null} className={`btn ${on ? 'btn-ghost' : 'btn-primary'}`}>
              {on ? <><BellOff size={16} /> Disattiva su questo dispositivo</> : <><Bell size={16} /> Attiva su questo dispositivo</>}
            </button>
            {on && <button className="btn btn-ghost" onClick={async () => {
              try { const r = await testPush(); toast(r.sent ? 'Notifica di prova inviata' : (r.error ?? 'Nessun dispositivo raggiunto'), { tone: r.sent ? 'ok' : 'err' }) }
              catch { toast('Invio non riuscito', { tone: 'err' }) }
            }}>Invia una prova</button>}
          </div>
        )}
        <ApnsKey />
        <ul className="divide-y divide-line rounded-2xl bg-sunken">
          {TYPES.map((t) => (
            <li key={t.key}>
              <label className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1"><span className="block text-sm font-medium">{t.label}</span><span className="text-xs text-muted">{t.text}</span></span>
                <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={prefs[t.key]} onChange={(e) => setPref(t.key, e.target.checked)} />
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Chiave APNs di Apple: serve al server per inviare le notifiche all'app iOS. Resta in private.config. */
function ApnsKey() {
  const toast = useToast()
  const [st, setSt] = useState<{ configured: boolean; keyId: string | null } | null>(null)
  const [open, setOpen] = useState(false)
  const [keyId, setKeyId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [p8, setP8] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('notify', { body })
    if (error) {
      const ctx = (error as { context?: Response }).context
      throw new Error((ctx ? await ctx.json().then((j) => j.error).catch(() => null) : null) ?? error.message)
    }
    return data
  }
  useEffect(() => { call({ action: 'apns_status' }).then(setSt).catch(() => setSt({ configured: false, keyId: null })) }, [])

  const save = async () => {
    setBusy(true)
    try {
      await call({ action: 'apns_configure', key_id: keyId, team_id: teamId, p8 })
      setSt({ configured: true, keyId: keyId.trim().toUpperCase() }); setOpen(false); setP8('')
      toast('Chiave APNs salvata')
    } catch (e) { toast((e as Error).message, { tone: 'err' }) }
    finally { setBusy(false) }
  }

  if (!st) return null
  if (st.configured && !open) return (
    <p className="flex items-center gap-2 text-xs text-muted">
      <KeyRound size={14} /> Chiave APNs attiva ({st.keyId}). <button className="underline underline-offset-4" onClick={() => setOpen(true)}>Cambia</button>
    </p>
  )
  return (
    <div className="space-y-3 rounded-2xl bg-sunken p-4">
      <p className="text-sm font-medium">Notifiche dell'app iOS: chiave APNs</p>
      <p className="text-xs text-muted">
        Su developer.apple.com › Certificates, IDs &amp; Profiles › Keys crea una chiave con <strong>Apple Push Notifications service (APNs)</strong>,
        scarica il file .p8 e inserisci qui i dati (puoi farlo anche dal computer). Il Team ID è in alto a destra nella pagina Membership.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input className="field" placeholder="Key ID" value={keyId} onChange={(e) => setKeyId(e.target.value)} autoCapitalize="characters" />
        <input className="field" placeholder="Team ID" value={teamId} onChange={(e) => setTeamId(e.target.value)} autoCapitalize="characters" />
      </div>
      <input ref={file} type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setP8(await f.text()) }} />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost" onClick={() => file.current?.click()}>{p8 ? 'File .p8 caricato' : 'Scegli il file .p8'}</button>
        <button className="btn btn-primary" disabled={busy || !keyId || !teamId || !p8} onClick={save}>{busy ? 'Verifica…' : 'Salva'}</button>
        {st.configured && <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annulla</button>}
      </div>
    </div>
  )
}
