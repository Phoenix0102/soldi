import { useState } from 'react'
import { Copy, Check, Smartphone, Trash2, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAccounts, useApiTokens, useAppSettings, useInvalidate } from '../lib/data'
import { longDate } from '../lib/format'
import { Confirm, Label, useToast } from './ui'

export const INGEST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest`

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return 'soldi_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2 rounded-2xl bg-sunken p-1.5 pl-4">
        <code className={`min-w-0 flex-1 truncate text-sm ${secret ? 'font-semibold' : ''}`}>{value}</code>
        <button className="btn btn-primary !px-3 !py-2 text-sm" onClick={async () => {
          await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800)
        }}>{done ? <><Check size={15} /> Copiato</> : <><Copy size={15} /> Copia</>}</button>
      </div>
    </div>
  )
}

/** Impostazioni → Apple Pay automatico: token, conto predefinito e guida a Comandi Rapidi. */
export function ApplePaySetup() {
  const { data: tokens = [] } = useApiTokens()
  const { data: settings } = useAppSettings()
  const { data: accounts = [] } = useAccounts()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [revoke, setRevoke] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    const token = newToken()
    const { error } = await supabase.from('api_tokens').insert({ label: 'Comandi Rapidi', token_hash: await sha256(token) })
    setBusy(false)
    if (error) return toast(`Non riuscito: ${error.message}`, { tone: 'err' })
    setFresh(token)
    invalidate('api_tokens')
  }

  const test = async (token: string) => {
    try {
      const r = await fetch(INGEST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ test: true }) })
      const j = await r.json()
      toast(j.ok ? 'Collegamento riuscito' : `Errore: ${j.error}`, { tone: j.ok ? 'ok' : 'err' })
      invalidate('api_tokens')
    } catch { toast('Il server non risponde. Controlla la connessione.', { tone: 'err' }) }
  }

  const setDefault = async (id: string) => {
    const { error } = await supabase.from('app_settings').upsert({ default_account_id: id || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return toast('Non riuscito', { tone: 'err' })
    invalidate('app_settings'); toast('Conto predefinito aggiornato')
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Zap size={18} /> Apple Pay automatico</h2>
        <p className="text-sm text-muted">Ogni pagamento fatto con l'iPhone si registra da solo, con categoria e conto. Serve l'app Comandi Rapidi.</p>
      </div>

      <div className="space-y-4 rounded-3xl bg-surface p-5">
        <label className="block">
          <Label>Conto usato se la carta non viene riconosciuta</Label>
          <select className="field" value={settings?.default_account_id ?? ''} onChange={(e) => setDefault(e.target.value)}>
            <option value="">Il primo conto della lista</option>
            {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted">Per associare una carta a un conto, apri il conto e compila "Nome della carta nel Wallet".</span>
        </label>

        {tokens.length > 0 && (
          <ul className="divide-y divide-line rounded-2xl bg-sunken">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Smartphone size={17} className="text-muted" />
                <span className="flex-1">
                  <span className="block font-medium">{t.label}</span>
                  <span className="text-muted">{t.last_used_at ? `Ultimo uso il ${longDate(t.last_used_at.slice(0, 10))}` : 'Mai usato'}</span>
                </span>
                <button onClick={() => setRevoke(t.id)} className="rounded-full p-2 text-faint hover:bg-surface hover:text-neg" aria-label="Revoca token"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}

        {fresh ? (
          <div className="space-y-4 rounded-2xl border border-gold/40 bg-gold/5 p-4">
            <p className="text-sm"><strong>Copia il token adesso:</strong> per sicurezza non verrà mostrato di nuovo. Se lo perdi, ne generi uno nuovo.</p>
            <CopyField label="Indirizzo" value={INGEST_URL} />
            <CopyField label="Token" value={fresh} secret />
            <button className="btn btn-ghost" onClick={() => test(fresh)}>Prova il collegamento</button>
          </div>
        ) : (
          <button onClick={create} disabled={busy} className="btn btn-primary">{tokens.length ? 'Genera un nuovo token' : 'Attiva e genera il token'}</button>
        )}

        <details className="rounded-2xl bg-sunken p-4 text-sm" open={!!fresh}>
          <summary className="cursor-pointer font-semibold">Come creare l'automazione su iPhone</summary>
          <ol className="mt-3 list-decimal space-y-2.5 pl-5 leading-relaxed">
            <li>Apri <strong>Comandi Rapidi</strong>, scheda <strong>Automazione</strong>, tocca <strong>+</strong> e scegli <strong>Transazione</strong>.</li>
            <li>Seleziona le carte da seguire (per esempio ING e Revolut), imposta <strong>Esegui immediatamente</strong> e tocca Avanti, poi <strong>Nuovo comando rapido vuoto</strong>.</li>
            <li>Aggiungi l'azione <strong>Ottieni contenuti dell'URL</strong> e incolla l'<strong>Indirizzo</strong> qui sopra.</li>
            <li>Tocca la freccia dell'azione: Metodo <strong>POST</strong>. In <strong>Intestazioni</strong> aggiungi la chiave <code>Authorization</code> con valore <code>Bearer </code> seguito dal token (con lo spazio dopo Bearer).</li>
            <li>In <strong>Corpo richiesta</strong> scegli <strong>JSON</strong> e aggiungi tre campi di testo: <code>amount</code> con la variabile <strong>Importo</strong>, <code>merchant</code> con <strong>Esercente</strong>, <code>card</code> con <strong>Carta o pass</strong>. Le variabili si scelgono toccando il campo e poi "Input comando rapido".</li>
            <li>Facoltativo: aggiungi <strong>Mostra notifica</strong> con <strong>Contenuti dell'URL</strong>, così vedi la conferma a ogni pagamento.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">I nomi di menu e variabili possono cambiare leggermente tra versioni di iOS. Le spese arrivano come "Da Apple Pay": se poi importi l'estratto conto, l'app le segnala come possibili doppioni.</p>
        </details>
      </div>

      <Confirm open={!!revoke} onClose={() => setRevoke(null)} danger confirmLabel="Revoca"
        title="Revocare il token?" text="L'automazione che lo usa smetterà di funzionare finché non inserisci un token nuovo."
        onConfirm={async () => { await supabase.from('api_tokens').delete().eq('id', revoke!); setRevoke(null); invalidate('api_tokens'); toast('Token revocato') }} />
    </section>
  )
}
