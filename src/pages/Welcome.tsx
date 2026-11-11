import { useEffect, useState } from 'react'
import { ArrowRight, Zap, Upload, PenLine, Shield, Bell, ScanFace, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAccounts, useAppSettings, useInvalidate } from '../lib/data'
import { parseAmount, round2, todayISO, money } from '../lib/format'
import { bioAvailable, bioEnabled, enableBio } from '../lib/biometric'
import { enablePush, isIOS, isStandalone, pushSupported } from '../lib/push'
import { hasPin } from '../auth/pin'
import { useGo } from '../components/nav'
import { Guilloche } from '../components/Guilloche'
import { Label, useToast } from '../components/ui'

type Way = 'applepay' | 'import' | 'manual'
const STEPS = ['Benvenuto', 'Saldi', 'Spese', 'Obiettivo', 'Sicurezza']

export const ONBOARDED = 'soldi-onboarded'

export default function Welcome() {
  const go = useGo()
  const toast = useToast()
  const invalidate = useInvalidate()
  const { data: accounts = [] } = useAccounts()
  const { data: settings } = useAppSettings()
  const [step, setStep] = useState(0)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [way, setWay] = useState<Way>('applepay')
  const [monthly, setMonthly] = useState('')
  const [months, setMonths] = useState(6)
  const [busy, setBusy] = useState(false)
  const [bio, setBio] = useState({ ok: false, on: bioEnabled() })
  const [push, setPush] = useState(false)
  useEffect(() => { bioAvailable().then((ok) => setBio((b) => ({ ...b, ok }))) }, [])

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const active = accounts.filter((a) => !a.archived)

  const saveBalances = async () => {
    const rows = active.flatMap((a) => {
      const n = parseAmount(vals[a.id] ?? '')
      return n === null ? [] : [{ account_id: a.id, date: todayISO(), balance: round2(a.type === 'debt' ? -Math.abs(n) : n) }]
    })
    if (rows.length) {
      setBusy(true)
      const { error } = await supabase.from('balance_snapshots').insert(rows)
      setBusy(false)
      if (error) return toast('Saldi non salvati, riprova', { tone: 'err' })
      invalidate('balance_snapshots')
    }
    next()
  }

  const saveGoal = async () => {
    const m = parseAmount(monthly)
    if (m && m > 0) {
      setBusy(true)
      await supabase.from('goals').insert({ name: 'Fondo emergenza', target_amount: Math.ceil((m * months) / 100) * 100, icon: 'shield', color: '#0f4d3a' })
      setBusy(false)
      invalidate('goals')
    }
    next()
  }

  const finish = async () => {
    localStorage.setItem(ONBOARDED, '1')
    await supabase.from('app_settings').upsert({ data: { ...(settings?.data ?? {}), onboarded: true }, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    invalidate('app_settings')
    go(way === 'applepay' ? '/impostazioni?sezione=applepay' : way === 'import' ? '/importa' : '/', { replace: true })
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex gap-1.5" aria-label={`Passo ${step + 1} di ${STEPS.length}`}>
        {STEPS.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= step ? 'bg-brand' : 'bg-line'}`} />)}
      </div>

      <div key={step} className="swipe-in-left">
        {step === 0 && (
          <section className="relative overflow-hidden rounded-[28px] bg-note p-7 text-note-ink">
            <Guilloche className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] opacity-40" />
            <div className="relative">
              <h1 className="text-[2.1rem] font-semibold leading-tight tracking-[-0.03em]">Benvenuto in Soldi</h1>
              <p className="mt-3 opacity-80">In due minuti prepariamo tutto: i saldi dei conti, come registrerai le spese e il tuo primo obiettivo.</p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex gap-3"><Check size={18} className="shrink-0" /> Patrimonio e spese sempre aggiornati, su telefono e computer</li>
                <li className="flex gap-3"><Check size={18} className="shrink-0" /> Budget, obiettivi e abbonamenti sotto controllo</li>
                <li className="flex gap-3"><Check size={18} className="shrink-0" /> Un percorso per imparare a gestire meglio i soldi</li>
              </ul>
              <button onClick={next} className="btn mt-8 w-full bg-note-ink py-3.5 text-note">Iniziamo <ArrowRight size={18} /></button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.02em]">Quanto hai oggi?</h1>
            <p className="mt-2 text-muted">Scrivi i saldi come li vedi nelle app delle banche. Puoi lasciare vuoti quelli che non sai.</p>
            <div className="mt-6 space-y-3">
              {active.map((a) => (
                <label key={a.id} className="flex items-center gap-3">
                  <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}{a.type === 'debt' && <span className="block text-xs font-normal text-muted">Quanto devi</span>}</span>
                  <input inputMode="decimal" className="field num !w-32 text-right" placeholder="0,00" value={vals[a.id] ?? ''} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value })} />
                </label>
              ))}
            </div>
            <button onClick={saveBalances} disabled={busy} className="btn btn-primary mt-8 w-full py-3.5">Continua</button>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.02em]">Come registrerai le spese?</h1>
            <p className="mt-2 text-muted">Puoi combinarle; scegli quella da impostare per prima.</p>
            <div className="mt-6 space-y-3">
              {([
                ['applepay', Zap, 'Apple Pay automatico', 'Ogni pagamento con iPhone si registra da solo. Consigliato.'],
                ['import', Upload, 'Estratto conto', 'Importi il file di ING, Revolut o Trade Republic quando vuoi.'],
                ['manual', PenLine, 'A mano', 'Con il tasto + in tre tocchi, anche da scontrino.'],
              ] as const).map(([k, I, title, text]) => (
                <button key={k} onClick={() => setWay(k)} className={`press flex w-full items-start gap-4 rounded-3xl p-4 text-left transition ${way === k ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface'}`}>
                  <I size={22} className="mt-0.5 shrink-0" />
                  <span><span className="block font-semibold">{title}</span><span className="text-sm text-muted">{text}</span></span>
                </button>
              ))}
            </div>
            <button onClick={next} className="btn btn-primary mt-8 w-full py-3.5">Continua</button>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.02em]">Il primo obiettivo: il fondo emergenza</h1>
            <p className="mt-2 text-muted">Una riserva per gli imprevisti, prima di qualsiasi investimento. Si misura in mesi di spese.</p>
            <label className="mt-6 block"><Label>Quanto spendi più o meno al mese?</Label>
              <input inputMode="decimal" className="field num text-xl" placeholder="Es. 900" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </label>
            <div className="mt-4 flex gap-2">
              {[3, 6].map((m) => <button key={m} onClick={() => setMonths(m)} className={`rounded-full px-4 py-2 text-sm font-medium ${months === m ? 'bg-ink text-paper' : 'bg-sunken'}`}>{m} mesi</button>)}
            </div>
            {parseAmount(monthly) ? <p className="mt-4 text-lg">Obiettivo: <strong className="num">{money(Math.ceil(((parseAmount(monthly) ?? 0) * months) / 100) * 100, true)}</strong></p> : null}
            <button onClick={saveGoal} disabled={busy} className="btn btn-primary mt-8 w-full py-3.5">{parseAmount(monthly) ? 'Crea obiettivo e continua' : 'Salta per ora'}</button>
          </section>
        )}

        {step === 4 && (
          <section>
            <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.02em]">Sicurezza e avvisi</h1>
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-4 rounded-3xl bg-surface p-4">
                <Shield size={22} className="shrink-0" />
                <span className="flex-1"><span className="block font-semibold">PIN</span><span className="text-sm text-muted">{hasPin() ? 'Attivo su questo dispositivo' : 'Puoi attivarlo nelle Impostazioni'}</span></span>
              </div>
              {bio.ok && hasPin() && (
                <div className="flex items-center gap-4 rounded-3xl bg-surface p-4">
                  <ScanFace size={22} className="shrink-0" />
                  <span className="flex-1"><span className="block font-semibold">Face ID o impronta</span><span className="text-sm text-muted">Apri l'app senza digitare il PIN</span></span>
                  {bio.on ? <Check className="text-pos" /> : <button className="btn btn-ghost !py-1.5" onClick={async () => { try { await enableBio(); setBio({ ok: true, on: true }) } catch { toast('Attivazione annullata', { tone: 'err' }) } }}>Attiva</button>}
                </div>
              )}
              <div className="flex items-center gap-4 rounded-3xl bg-surface p-4">
                <Bell size={22} className="shrink-0" />
                <span className="flex-1"><span className="block font-semibold">Notifiche</span><span className="text-sm text-muted">{isIOS() && !isStandalone() ? 'Disponibili dopo aver aggiunto Soldi alla schermata Home' : 'Scadenze, budget e resoconto del mese'}</span></span>
                {push ? <Check className="text-pos" /> : pushSupported() && !(isIOS() && !isStandalone()) && (
                  <button className="btn btn-ghost !py-1.5" onClick={async () => { try { await enablePush(); setPush(true) } catch (e) { toast((e as Error).message, { tone: 'err' }) } }}>Attiva</button>
                )}
              </div>
            </div>
            <button onClick={finish} className="btn btn-primary mt-8 w-full py-3.5">
              {way === 'applepay' ? 'Fine: imposta Apple Pay' : way === 'import' ? 'Fine: importa l\'estratto conto' : 'Fine: vai alla Home'}
            </button>
          </section>
        )}
      </div>
      {step > 0 && <button onClick={finish} className="mt-4 w-full text-center text-sm text-muted underline underline-offset-4">Salta la configurazione</button>}
    </div>
  )
}
