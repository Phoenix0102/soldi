import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
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
              try { const r = await testPush(); toast(r.sent ? 'Notifica di prova inviata' : 'Nessun dispositivo raggiunto', { tone: r.sent ? 'ok' : 'err' }) }
              catch { toast('Invio non riuscito', { tone: 'err' }) }
            }}>Invia una prova</button>}
          </div>
        )}
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
