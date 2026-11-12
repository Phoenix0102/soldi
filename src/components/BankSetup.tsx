import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Landmark, RefreshCw, Loader2, Plus, Unlink, ExternalLink, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { bank, BANK_REDIRECT } from '../lib/bank'
import { useAccounts, useBankAccounts, useBankConnections, useInvalidate } from '../lib/data'
import { longDate } from '../lib/format'
import { Confirm, Label, Sheet, useToast } from './ui'

const relative = (iso: string | null) => {
  if (!iso) return 'mai'
  const m = Math.round((Date.now() - +new Date(iso)) / 60000)
  if (m < 2) return 'adesso'
  if (m < 60) return `${m} minuti fa`
  if (m < 60 * 24) return `${Math.round(m / 60)} ore fa`
  return longDate(iso.slice(0, 10))
}

/** Sincronizza le banche collegate: ritorna un riepilogo leggibile. */
export function useBankSync() {
  const invalidate = useInvalidate()
  return async () => {
    const r = await bank<{ inserted: number; merged: number; errors: string[] }>('sync')
    invalidate('transactions', 'balance_snapshots', 'bank_connections')
    return r
  }
}

export function BankSetup() {
  const status = useQuery({ queryKey: ['bank_status'], queryFn: () => bank<{ configured: boolean; appId: string | null }>('status'), retry: 0 })
  const { data: conns = [] } = useBankConnections()
  const { data: links = [] } = useBankAccounts()
  const { data: accounts = [] } = useAccounts()
  const invalidate = useInvalidate()
  const toast = useToast()
  const sync = useBankSync()
  const [cfgOpen, setCfgOpen] = useState(false)
  const [pick, setPick] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drop, setDrop] = useState<string | null>(null)

  const active = conns.filter((c) => c.status !== 'pending')
  const configured = status.data?.configured

  const runSync = async () => {
    setBusy(true)
    try {
      const r = await sync()
      toast(r.errors.length ? `Sincronizzazione con errori: ${r.errors[0]}` : `Sincronizzato: ${r.inserted} nuovi movimenti${r.merged ? `, ${r.merged} già presenti collegati` : ''}`, { tone: r.errors.length ? 'err' : 'ok' })
    } catch (e) { toast((e as Error).message, { tone: 'err' }) }
    finally { setBusy(false) }
  }

  const map = async (linkId: string, accountId: string) => {
    await supabase.from('bank_accounts').update({ account_id: accountId || null }).eq('id', linkId)
    invalidate('bank_accounts')
  }

  return (
    <section id="banche">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Landmark size={18} /> Collegamento banche</h2>
        <p className="text-sm text-muted">Movimenti e saldi di ING e Revolut arrivano da soli, due volte al giorno. Accesso in sola lettura tramite Enable Banking (PSD2).</p>
      </div>
      <div className="space-y-4 rounded-3xl bg-surface p-5">
        {status.isLoading ? <p className="text-sm text-muted">Controllo la configurazione…</p> : !configured ? (
          <div className="space-y-3">
            <p className="text-sm">Serve un'applicazione gratuita su Enable Banking, una sola volta.</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
              <li>Registrati su <a className="text-ink underline underline-offset-4" href="https://enablebanking.com/cp" target="_blank" rel="noreferrer">enablebanking.com <ExternalLink size={12} className="inline" /></a> e crea un'applicazione <strong className="text-ink">Production</strong>, facendo generare la chiave al browser. Scarica il file <code>.pem</code>.</li>
              <li>Tra gli indirizzi di ritorno (redirect URL) dell'applicazione aggiungi: <code className="break-all text-ink">{BANK_REDIRECT}</code></li>
              <li>Premi <strong className="text-ink">Activate by linking accounts</strong> e collega ING e Revolut: in modalità gratuita sono leggibili solo i conti collegati lì.</li>
              <li>Torna qui e inserisci l'ID applicazione e il file della chiave.</li>
            </ol>
            <button className="btn btn-primary" onClick={() => setCfgOpen(true)}>Inserisci le credenziali</button>
          </div>
        ) : (
          <>
            {active.length === 0 ? <p className="text-sm text-muted">Configurazione pronta. Collega la prima banca.</p> : (
              <ul className="space-y-3">
                {active.map((c) => {
                  const own = links.filter((l) => l.connection_id === c.id)
                  const days = c.valid_until ? Math.round((+new Date(c.valid_until) - Date.now()) / 86400000) : null
                  return (
                    <li key={c.id} className="rounded-2xl bg-sunken p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{c.aspsp_name}</p>
                          <p className="text-sm text-muted">
                            {c.status === 'expired' ? 'Consenso scaduto: ricollega la banca' : `Aggiornato ${relative(c.last_sync_at)}${days !== null ? `, consenso valido ancora ${days} giorni` : ''}`}
                          </p>
                          {c.last_error && <p className="mt-1 text-xs text-neg">{c.last_error}</p>}
                        </div>
                        <button className="rounded-full p-2 text-faint hover:bg-surface hover:text-neg" onClick={() => setDrop(c.id)} aria-label="Scollega"><Unlink size={16} /></button>
                      </div>
                      {own.map((l) => (
                        <label key={l.id} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{l.name}{l.iban ? ` (${l.iban.slice(-4)})` : ''}</span>
                          <select className="field !w-auto !py-1.5" value={l.account_id ?? ''} onChange={(e) => map(l.id, e.target.value)}>
                            <option value="">Non importare</option>
                            {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>→ {a.name}</option>)}
                          </select>
                        </label>
                      ))}
                      {days !== null && days < 15 && c.status === 'active' && <p className="mt-2 text-xs text-gold">Il consenso scade presto: ricollega la banca per non interrompere gli aggiornamenti.</p>}
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => setPick(true)}><Plus size={16} /> Collega una banca</button>
              {active.length > 0 && <button className="btn btn-ghost" disabled={busy} onClick={runSync}>{busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sincronizza ora</button>}
            </div>
            <button className="text-xs text-muted underline underline-offset-4" onClick={() => setCfgOpen(true)}>Cambia credenziali Enable Banking</button>
          </>
        )}
      </div>
      {cfgOpen && <ConfigSheet onClose={() => setCfgOpen(false)} onDone={() => status.refetch()} />}
      {pick && <PickBank onClose={() => setPick(false)} />}
      <Confirm open={!!drop} onClose={() => setDrop(null)} danger confirmLabel="Scollega" title="Scollegare la banca?"
        text="Gli aggiornamenti automatici si fermano. I movimenti già importati restano."
        onConfirm={async () => { try { await bank('disconnect', { id: drop }); invalidate('bank_connections'); toast('Banca scollegata') } catch (e) { toast((e as Error).message, { tone: 'err' }) } setDrop(null) }} />
    </section>
  )
}

function ConfigSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [appId, setAppId] = useState('')
  const [pem, setPem] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const save = async () => {
    setBusy(true)
    try {
      const r = await bank<{ name: string | null; redirect_urls: string[] }>('configure', { app_id: appId, private_key: pem })
      const missing = !(r.redirect_urls ?? []).some((u) => u.replace(/\/+$/, '') === BANK_REDIRECT.replace(/\/+$/, ''))
      toast(missing ? 'Credenziali valide, ma aggiungi l\'indirizzo di ritorno nell\'applicazione Enable Banking' : `Collegato a ${r.name ?? 'Enable Banking'}`, { tone: missing ? 'err' : 'ok' })
      onDone(); onClose()
    } catch (e) { toast((e as Error).message, { tone: 'err' }) }
    finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="Credenziali Enable Banking">
      <div className="space-y-4">
        <label className="block"><Label>ID applicazione</Label><input className="field num" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" /></label>
        <div>
          <Label>Chiave privata (file .pem)</Label>
          <button className="btn btn-ghost w-full" onClick={() => file.current?.click()}><Upload size={16} /> {pem ? 'File caricato' : 'Scegli il file .pem'}</button>
          <input ref={file} type="file" accept=".pem,.key,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPem(await f.text()) }} />
          <p className="mt-1.5 text-xs text-muted">La chiave viene salvata solo sul server e non torna mai nel browser.</p>
        </div>
        <button className="btn btn-primary w-full py-3.5" disabled={busy || !appId || !pem} onClick={save}>{busy ? 'Verifico…' : 'Verifica e salva'}</button>
      </div>
    </Sheet>
  )
}

function PickBank({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [going, setGoing] = useState<string | null>(null)
  const list = useQuery({ queryKey: ['aspsps', 'IT'], queryFn: () => bank<{ aspsps: { name: string; country: string; logo?: string; max?: number }[] }>('aspsps', { country: 'IT' }), staleTime: 3600_000 })
  const shown = useMemo(() => {
    const all = list.data?.aspsps ?? []
    const prefer = ['ING', 'Revolut', 'Trade Republic']
    return all.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (prefer.findIndex((p) => b.name.includes(p)) > -1 ? 1 : 0) - (prefer.findIndex((p) => a.name.includes(p)) > -1 ? 1 : 0))
  }, [list.data, q])
  const go = async (a: { name: string; country: string; max?: number }) => {
    setGoing(a.name)
    try {
      const r = await bank<{ url: string }>('start', { aspsp_name: a.name, country: a.country, max: a.max, redirect_url: BANK_REDIRECT })
      location.href = r.url
    } catch (e) { toast((e as Error).message, { tone: 'err' }); setGoing(null) }
  }
  return (
    <Sheet open onClose={onClose} title="Scegli la banca">
      <input className="field" placeholder="Cerca, per esempio ING" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 max-h-[55dvh] overflow-y-auto">
        {list.isLoading ? <p className="py-6 text-center text-sm text-muted">Carico le banche…</p> : list.isError ? <p className="py-6 text-center text-sm text-neg">{(list.error as Error).message}</p> : (
          <ul className="divide-y divide-line">
            {shown.map((a) => (
              <li key={a.name}><button className="flex w-full items-center gap-3 py-3 text-left hover:bg-sunken" onClick={() => go(a)} disabled={!!going}>
                {a.logo ? <img src={a.logo} alt="" className="h-8 w-8 rounded-lg object-contain" /> : <Landmark size={20} />}
                <span className="flex-1 font-medium">{a.name}</span>
                {going === a.name && <Loader2 size={16} className="animate-spin" />}
              </button></li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Verrai portato sul sito della banca per dare il consenso, poi tornerai qui.</p>
    </Sheet>
  )
}

/** Al ritorno dalla banca: chiude il collegamento con il codice ricevuto. */
export function useBankReturn(onDone: () => void) {
  const toast = useToast()
  const invalidate = useInvalidate()
  const once = useRef(false)
  useEffect(() => {
    if (once.current) return
    const p = new URLSearchParams(location.search)
    const code = p.get('code'), state = p.get('state'), err = p.get('error')
    if (!code && !err) return
    once.current = true
    history.replaceState(null, '', `${location.pathname}${location.hash || '#/'}`)
    if (err) { toast(`La banca non ha concesso l'accesso: ${p.get('error_description') ?? err}`, { tone: 'err' }); return }
    bank<{ bank: string; accounts: number }>('complete', { code, state })
      .then(async (r) => {
        toast(`${r.bank} collegata: ${r.accounts} ${r.accounts === 1 ? 'conto' : 'conti'}. Scegli dove importarli.`)
        invalidate('bank_connections')
        onDone()
      })
      .catch((e) => toast((e as Error).message, { tone: 'err' }))
  }, [toast, invalidate, onDone])
}
