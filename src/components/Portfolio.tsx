import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Search, Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useHoldings, useInvalidate, useTable } from '../lib/data'
import { money, parseAmount, percent, percent1, round2 } from '../lib/format'
import type { Holding } from '../lib/types'
import { Confirm, Empty, Label, Sheet, useToast } from './ui'

async function quotes<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('quotes', { body })
  if (error) throw error
  return data as T
}

/** Aggiorna i prezzi di tutti i titoli e il valore dei conti investimenti. */
export function useRefreshQuotes() {
  const invalidate = useInvalidate()
  return async () => {
    const r = await quotes<{ updated: number; failed: string[] }>({ refresh: true })
    invalidate('holdings')
    return r
  }
}

const value = (h: Holding) => h.quantity * (h.last_price ?? h.avg_price)

export function Portfolio({ accountId }: { accountId: string }) {
  const { data: all = [], isFetched } = useHoldings()
  const holdings = all.filter((h) => h.account_id === accountId)
  const refresh = useRefreshQuotes()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Holding | 'new' | null>(null)
  const auto = useRef(false)

  const doRefresh = async (silent = false) => {
    setBusy(true)
    try {
      const r = await refresh()
      if (!silent) toast(r.failed.filter(Boolean).length ? `Aggiornati ${r.updated}, non trovati: ${r.failed.join(', ')}` : 'Quotazioni aggiornate')
    } catch { if (!silent) toast('Quotazioni non disponibili ora, riprova più tardi', { tone: 'err' }) }
    finally { setBusy(false) }
  }

  // Aggiornamento automatico se i prezzi hanno più di un'ora
  useEffect(() => {
    if (auto.current || !isFetched || !holdings.length) return
    const oldest = Math.min(...holdings.map((h) => (h.last_price_at ? +new Date(h.last_price_at) : 0)))
    if (Date.now() - oldest > 3600_000) { auto.current = true; doRefresh(true) }
  }, [isFetched, holdings.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = holdings.reduce((s, h) => s + value(h), 0)
  const cost = holdings.reduce((s, h) => s + h.quantity * h.avg_price, 0)
  const gain = total - cost
  const day = holdings.reduce((s, h) => s + (h.prev_close && h.last_price ? h.quantity * (h.last_price - h.prev_close) : 0), 0)
  const updatedAt = holdings.map((h) => h.last_price_at).filter(Boolean).sort().pop()

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Portafoglio</h2>
          <p className="text-sm text-muted">{updatedAt ? `Prezzi aggiornati alle ${new Date(updatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} del ${new Date(updatedAt).toLocaleDateString('it-IT')}` : 'Aggiungi i tuoi ETF e titoli: il valore si aggiorna da solo.'}</p>
        </div>
        <div className="flex gap-2">
          {holdings.length > 0 && <button className="btn btn-ghost !px-3" disabled={busy} onClick={() => doRefresh()} aria-label="Aggiorna quotazioni">{busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}</button>}
          <button className="btn btn-primary" onClick={() => setForm('new')}><Plus size={17} /> Titolo</button>
        </div>
      </div>

      {holdings.length === 0 ? (
        <Empty title="Nessun titolo" text="Cerca per ISIN, ticker o nome (per esempio VWCE) e inserisci quante quote hai e il prezzo medio di acquisto." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Valore" value={money(total, true)} />
            <Stat label="Guadagno" value={`${gain >= 0 ? '+' : '−'}${money(Math.abs(gain), true)}`} sub={cost > 0 ? `${gain >= 0 ? '+' : '−'}${percent(Math.abs(gain / cost))}` : undefined} tone={gain >= 0 ? 'pos' : 'neg'} />
            <Stat label="Oggi" value={`${day >= 0 ? '+' : '−'}${money(Math.abs(day), true)}`} tone={day >= 0 ? 'pos' : 'neg'} />
          </div>
          <ul className="mt-3 divide-y divide-line rounded-3xl bg-surface">
            {holdings.map((h, i) => {
              const v = value(h), g = v - h.quantity * h.avg_price
              const d = h.prev_close && h.last_price ? (h.last_price - h.prev_close) / h.prev_close : null
              return (
                <li key={h.id} className="rise" style={{ '--i': i } as React.CSSProperties}>
                  <button className="press flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sunken" onClick={() => setForm(h)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.name}</span>
                      <span className="block text-sm text-muted num">{h.symbol || 'Prezzo manuale'}, {h.quantity.toLocaleString('it-IT', { maximumFractionDigits: 6 })} quote{h.last_price ? ` a ${money(h.last_price)}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block font-semibold">{money(v)}</span>
                      <span className={`num inline-flex items-center gap-1 text-xs ${g >= 0 ? 'text-pos' : 'text-neg'}`}>
                        {g >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{g >= 0 ? '+' : '−'}{money(Math.abs(g), true)}
                        {d !== null && <span className="text-muted">, oggi {d >= 0 ? '+' : '−'}{percent1(Math.abs(d))}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">Il valore del portafoglio diventa il saldo di questo conto. Quotazioni da Yahoo Finance, indicative e possibilmente ritardate.</p>
        </>
      )}
      {form && <HoldingForm accountId={accountId} holding={form === 'new' ? undefined : form} onClose={() => setForm(null)} onSaved={() => doRefresh(true)} />}
    </section>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="min-w-0 rounded-3xl bg-surface p-3.5 sm:p-4">
      <p className="truncate text-[0.8rem] text-muted sm:text-sm">{label}</p>
      <p className={`num mt-1 truncate text-lg font-semibold ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''}`}>{value}</p>
      {sub && <p className={`num text-xs ${tone === 'pos' ? 'text-pos' : 'text-neg'}`}>{sub}</p>}
    </div>
  )
}

type Result = { symbol: string; name: string; exchange: string; type: string }

function HoldingForm({ accountId, holding, onClose, onSaved }: { accountId: string; holding?: Holding; onClose: () => void; onSaved: () => void }) {
  const { insert, update, remove } = useTable<Holding & Record<string, unknown>>('holdings')
  const qc = useQueryClient()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<{ symbol: string; name: string; price?: number } | null>(holding ? { symbol: holding.symbol, name: holding.name, price: holding.last_price ?? undefined } : null)
  const [qty, setQty] = useState(holding ? String(holding.quantity).replace('.', ',') : '')
  const [avg, setAvg] = useState(holding ? String(holding.avg_price).replace('.', ',') : '')
  const [manual, setManual] = useState(holding ? !holding.symbol : false)
  const [manualPrice, setManualPrice] = useState(holding?.last_price ? String(holding.last_price).replace('.', ',') : '')
  const [ask, setAsk] = useState(false)

  const doSearch = async () => {
    if (q.trim().length < 2) return
    setSearching(true)
    try { setResults((await quotes<{ results: Result[] }>({ search: q.trim() })).results) }
    catch { toast('Ricerca non disponibile ora', { tone: 'err' }) }
    finally { setSearching(false) }
  }

  const pick = async (r: Result) => {
    setPicked({ symbol: r.symbol, name: r.name })
    setResults([])
    try {
      const p = await quotes<{ priceEur: number }>({ symbol: r.symbol })
      setPicked({ symbol: r.symbol, name: r.name, price: p.priceEur })
      if (!avg) setAvg(String(round2(p.priceEur)).replace('.', ','))
    } catch { /* il prezzo arriverà con il prossimo aggiornamento */ }
  }

  const save = async () => {
    const quantity = parseAmount(qty), avgPrice = parseAmount(avg) ?? 0
    if (!quantity || quantity <= 0) return toast('Inserisci il numero di quote', { tone: 'err' })
    const mp = parseAmount(manualPrice)
    if (manual && !mp) return toast('Inserisci il prezzo attuale', { tone: 'err' })
    const row = manual
      ? { account_id: accountId, symbol: '', name: picked?.name || q || 'Titolo', quantity, avg_price: avgPrice, last_price: mp, last_price_at: new Date().toISOString() }
      : { account_id: accountId, symbol: picked!.symbol, name: picked!.name, quantity, avg_price: avgPrice, ...(picked?.price ? { last_price: picked.price } : {}) }
    if (holding) await update.mutateAsync({ id: holding.id, ...row }); else await insert.mutateAsync(row)
    qc.invalidateQueries({ queryKey: ['holdings'] })
    toast(holding ? 'Titolo aggiornato' : 'Titolo aggiunto')
    onSaved(); onClose()
  }

  return (
    <Sheet open onClose={onClose} title={holding ? 'Modifica titolo' : 'Aggiungi titolo'}>
      <div className="space-y-4">
        {!holding && !manual && (
          <div>
            <Label>Cerca per ISIN, ticker o nome</Label>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); doSearch() }}>
              <input className="field" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Es. VWCE, IE00BK5BQT80" />
              <button className="btn btn-primary !px-3.5" aria-label="Cerca">{searching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}</button>
            </form>
            {results.length > 0 && (
              <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-2xl bg-sunken">
                {results.map((r) => (
                  <li key={r.symbol}><button className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-line" onClick={() => pick(r)}>
                    <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span><span className="text-muted">{r.symbol}, {r.exchange}</span></span>
                  </button></li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-muted">Se cerchi per ISIN e non trovi la borsa giusta, prova con il ticker: su Trade Republic gli ETF sono di solito quotati su Xetra (simbolo con .DE).</p>
          </div>
        )}
        {picked && !manual && (
          <div className="rounded-2xl bg-brand-soft p-4">
            <p className="font-semibold">{picked.name}</p>
            <p className="text-sm text-muted">{picked.symbol}{picked.price ? `, prezzo attuale ${money(picked.price)}` : ''}</p>
          </div>
        )}
        {manual && (
          <>
            <label className="block"><Label>Nome</Label><input className="field" value={picked?.name ?? q} onChange={(e) => { setPicked({ symbol: '', name: e.target.value }); setQ(e.target.value) }} /></label>
            <label className="block"><Label>Prezzo attuale per quota</Label><input className="field num" inputMode="decimal" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="0,00" /></label>
          </>
        )}
        {(picked || manual) && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><Label>Quote</Label><input className="field num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Es. 12,5" /></label>
            <label className="block"><Label>Prezzo medio di carico</Label><input className="field num" inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="0,00" /></label>
          </div>
        )}
        {!holding && <button className="text-sm text-muted underline underline-offset-4" onClick={() => setManual(!manual)}>{manual ? 'Cerca il titolo con le quotazioni' : 'Non lo trovo: inserisco il prezzo a mano'}</button>}
        <div className="flex gap-3 pt-2">
          {holding && <button className="btn btn-danger" onClick={() => setAsk(true)}>Elimina</button>}
          <button className="btn btn-primary flex-1 py-3.5" disabled={!picked && !manual} onClick={save}>{holding ? 'Salva' : 'Aggiungi'}</button>
        </div>
      </div>
      <Confirm open={ask} onClose={() => setAsk(false)} danger confirmLabel="Elimina" title="Eliminare il titolo?" text="Il valore del conto verrà ricalcolato senza questo titolo."
        onConfirm={async () => { await remove.mutateAsync(holding!.id); setAsk(false); toast('Titolo eliminato'); onSaved(); onClose() }} />
    </Sheet>
  )
}
