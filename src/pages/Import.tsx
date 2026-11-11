import { useMemo, useRef, useState } from 'react'
import { FileUp, ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAccounts, useCategories, useImportProfiles, useRules, useTransactions, useInvalidate, useSnapshots } from '../lib/data'
import { applyRules, suggestFromHistory } from '../lib/finance'
import { detect, extract, hashRow, readFile, type FullMapping, type Grid } from '../lib/importer'
import { supabase } from '../lib/supabase'
import { money, shortDate } from '../lib/format'
import type { TxKind } from '../lib/types'
import { AccountChips } from '../components/QuickAdd'
import { Label, PageHeader, useToast } from '../components/ui'

interface Row {
  key: string; date: string; amount: number; description: string; balance: number | null
  category_id: string | null; kind: TxKind; include: boolean; dup: 'exact' | 'maybe' | null; hash: string
}

const TRANSFER_HINT = /(giroconto|ricarica|top.?up|trasferimento tra|bonifico a (me|mio)|own account|to pocket|da pocket|exchange|cambio valuta)/i

export default function Import() {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: rules = [] } = useRules()
  const { data: txs = [] } = useTransactions()
  const { data: snaps = [] } = useSnapshots()
  const { data: profiles = [] } = useImportProfiles()
  const invalidate = useInvalidate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [accountId, setAccountId] = useState('')
  const [fileName, setFileName] = useState('')
  const [grid, setGrid] = useState<Grid | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<FullMapping | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [skipped, setSkipped] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ n: number; snapshot: boolean } | null>(null)

  const account = accounts.find((a) => a.id === accountId)
  const otherInstitutions = useMemo(
    () => accounts.filter((a) => a.id !== accountId).flatMap((a) => [a.institution, a.name.split(' ')[0]]).filter((s): s is string => !!s && s.length > 2).map((s) => s.toLowerCase()),
    [accounts, accountId],
  )

  const build = async (g: Grid, h: string[], m: FullMapping) => {
    const { rows: parsed, skipped: sk } = extract(g, h, m)
    setSkipped(sk)
    const existing = new Set(txs.filter((t) => t.account_id === accountId && t.import_hash).map((t) => t.import_hash))
    const manual = txs.filter((t) => t.account_id === accountId && t.source !== 'csv')
    const seen = new Map<string, number>()
    const out: Row[] = []
    for (const r of parsed) {
      const k = `${r.date}|${r.amount}|${r.description.toLowerCase()}`
      const n = seen.get(k) ?? 0
      seen.set(k, n + 1)
      const hash = await hashRow(accountId, r, n)
      const lower = r.description.toLowerCase()
      const isTransfer = TRANSFER_HINT.test(r.description) || otherInstitutions.some((i) => lower.includes(i))
      const ruled = applyRules(r.description, rules, categories, r.amount)
      const category_id = isTransfer ? null : ruled?.category_id ?? suggestFromHistory(r.description, txs)
      const exact = existing.has(hash)
      const maybe = !exact && manual.some((t) => Math.abs(t.amount - r.amount) < 0.01 && Math.abs(+new Date(t.date) - +new Date(r.date)) <= 3 * 86400000)
      out.push({
        key: hash, hash, date: r.date, amount: r.amount, description: ruled?.rename_to || r.description || '(senza descrizione)', balance: r.balance,
        category_id, kind: isTransfer ? 'transfer' : r.amount > 0 ? 'income' : 'expense',
        include: !exact && !maybe, dup: exact ? 'exact' : maybe ? 'maybe' : null,
      })
    }
    setRows(out.sort((a, b) => b.date.localeCompare(a.date)))
  }

  const onFile = async (file: File) => {
    if (!accountId) return toast('Scegli prima il conto', { tone: 'err' })
    try {
      const g = await readFile(file)
      if (!g.length) throw new Error('File vuoto')
      const d = detect(g)
      const saved = profiles.find((p) => p.account_id === accountId)?.mapping as FullMapping | undefined
      const m = saved && d.headers.includes(saved.date) && d.headers.includes(saved.description) ? { ...d.mapping, ...saved, skipRows: d.headerRow } : d.mapping
      setFileName(file.name); setGrid(g); setHeaders(d.headers); setMap(m); setDone(null)
      await build(g, d.headers, m)
    } catch (e) {
      toast(`Non riesco a leggere il file: ${(e as Error).message}`, { tone: 'err' })
    }
  }

  const changeMap = async (patch: Partial<FullMapping>) => {
    if (!grid || !map) return
    const m = { ...map, ...patch }
    setMap(m)
    await build(grid, headers, m)
  }

  const doImport = async () => {
    const sel = rows.filter((r) => r.include)
    if (!sel.length || !map) return
    setBusy(true)
    try {
      const payload = sel.map((r) => ({
        account_id: accountId, date: r.date, amount: r.amount, description: r.description,
        category_id: r.kind === 'transfer' ? null : r.category_id, kind: r.kind, source: 'csv', import_hash: r.hash,
      }))
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase.from('transactions').upsert(payload.slice(i, i + 500), { onConflict: 'user_id,import_hash', ignoreDuplicates: true })
        if (error) throw error
      }
      await supabase.from('import_profiles').upsert({ account_id: accountId, name: account?.name ?? 'Profilo', mapping: map }, { onConflict: 'user_id,account_id' })

      // Se l'estratto riporta il saldo, lo uso come saldo verificato
      let snapshot = false
      const withBal = rows.filter((r) => r.balance !== null)
      if (withBal.length) {
        const latest = withBal.reduce((a, b) => (b.date > a.date ? b : a))
        const sameDay = withBal.filter((r) => r.date === latest.date)
        const pickRow = sameDay.length > 1 ? sameDay[0] : latest
        const already = snaps.some((s) => s.account_id === accountId && s.date >= latest.date)
        if (!already && pickRow.balance !== null) {
          await supabase.from('balance_snapshots').insert({ account_id: accountId, date: latest.date, balance: pickRow.balance })
          snapshot = true
        }
      }
      invalidate('transactions', 'import_profiles', 'balance_snapshots')
      setDone({ n: sel.length, snapshot })
      setRows([]); setGrid(null)
    } catch (e) {
      toast(`Importazione non riuscita: ${(e as Error).message}`, { tone: 'err' })
    } finally { setBusy(false) }
  }

  const sel = rows.filter((r) => r.include)
  const exp = categories.filter((c) => !c.archived)

  return (
    <div>
      <PageHeader title="Importa estratto conto" subtitle="CSV o Excel scaricato dall'home banking. I doppioni vengono riconosciuti e scartati." />

      {done && (
        <div className="mb-6 flex items-start gap-3 rounded-3xl bg-brand-soft p-5">
          <CheckCircle2 className="mt-0.5 shrink-0 text-pos" />
          <div>
            <p className="font-semibold">{done.n} movimenti importati su {account?.name}</p>
            <p className="text-sm text-muted">{done.snapshot ? 'Ho anche aggiornato il saldo usando quello riportato nel file.' : 'Controlla che il saldo del conto corrisponda a quello della banca; se no, correggilo dalla pagina del conto.'}</p>
          </div>
        </div>
      )}

      <section className="rounded-3xl bg-surface p-5 sm:p-6">
        <Label>1. Su quale conto?</Label>
        <AccountChips value={accountId} onChange={(id) => { setAccountId(id); setRows([]); setGrid(null) }} />
        <div className="mt-5">
          <Label>2. Scegli il file</Label>
          <button disabled={!accountId} onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-8 text-center transition hover:border-brand disabled:opacity-50"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
            <FileUp className="text-muted" />
            <span className="font-medium">{fileName || 'Trascina qui il file o tocca per sceglierlo'}</span>
            <span className="text-sm text-muted">CSV, XLSX, XLS</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
        </div>
        <details className="mt-4 text-sm text-muted">
          <summary className="cursor-pointer">Dove trovo il file della mia banca?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>ING</strong>: dal sito, sezione Movimenti del conto, poi Esporta in Excel.</li>
            <li><strong>Revolut</strong>: nell'app tocca il conto, poi Estratto conto, formato Excel o CSV.</li>
            <li><strong>Trade Republic</strong>: dal sito web, profilo, Attività o Documenti, esportazione delle transazioni.</li>
            <li><strong>Klarna</strong>: non c'è un export; registra gli acquisti a rate come uscite sul conto Klarna e le rate pagate come giroconti verso Klarna.</li>
          </ul>
          <p className="mt-2">Le voci dei menu possono cambiare con gli aggiornamenti delle app.</p>
        </details>
      </section>

      {map && grid && (
        <section className="mt-6 rounded-3xl bg-surface p-5 sm:p-6">
          <h2 className="font-semibold">3. Controlla le colonne</h2>
          <p className="text-sm text-muted">Le ho riconosciute da sole. La scelta viene ricordata per {account?.name}.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ColSelect label="Data" value={map.date} headers={headers} onChange={(v) => changeMap({ date: v })} />
            <ColSelect label="Descrizione" value={map.description} headers={headers} onChange={(v) => changeMap({ description: v })} />
            {map.debit || map.credit ? (
              <>
                <ColSelect label="Uscite" value={map.debit} headers={headers} optional onChange={(v) => changeMap({ debit: v })} />
                <ColSelect label="Entrate" value={map.credit} headers={headers} optional onChange={(v) => changeMap({ credit: v })} />
              </>
            ) : (
              <ColSelect label="Importo" value={map.amount} headers={headers} onChange={(v) => changeMap({ amount: v })} />
            )}
            <ColSelect label="Saldo (facoltativo)" value={map.balance} headers={headers} optional onChange={(v) => changeMap({ balance: v })} />
            <label className="block">
              <Label>Formato data</Label>
              <select className="field" value={map.dateFormat} onChange={(e) => changeMap({ dateFormat: e.target.value as FullMapping['dateFormat'] })}>
                <option value="dmy">Giorno/Mese/Anno</option><option value="ymd">Anno-Mese-Giorno</option><option value="mdy">Mese/Giorno/Anno</option>
              </select>
            </label>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={map.invert} onChange={(e) => changeMap({ invert: e.target.checked })} className="accent-[var(--brand)]" />
            Le uscite risultano positive: inverti i segni
          </label>
        </section>
      )}

      {rows.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">4. Anteprima</h2>
              <p className="text-sm text-muted">
                {sel.length} da importare su {rows.length}
                {rows.some((r) => r.dup === 'exact') && `, ${rows.filter((r) => r.dup === 'exact').length} già presenti`}
                {skipped > 0 && `, ${skipped} righe ignorate (annullate o senza importo)`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setRows([]); setGrid(null); setFileName('') }} className="btn btn-ghost"><ArrowLeft size={16} /> Annulla</button>
              <button onClick={doImport} disabled={!sel.length || busy} className="btn btn-primary">{busy ? 'Importo…' : `Importa ${sel.length} movimenti`}</button>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl bg-surface">
            <ul className="divide-y divide-line">
              {rows.slice(0, 300).map((r, i) => (
                <li key={r.key} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_4.5rem_1fr_7rem_13rem] ${r.include ? '' : 'opacity-50'}`}>
                  <input type="checkbox" checked={r.include} aria-label="Includi" className="h-4.5 w-4.5 accent-[var(--brand)]"
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                  <span className="num hidden text-sm text-muted sm:block">{shortDate(r.date)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.description}</span>
                    <span className="block text-xs text-muted sm:hidden">{shortDate(r.date)}</span>
                    {r.dup && <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-gold"><AlertTriangle size={12} /> {r.dup === 'exact' ? 'Già importato' : 'Forse già inserito a mano'}</span>}
                  </span>
                  <span className={`num text-right text-sm font-semibold ${r.amount > 0 ? 'text-pos' : ''}`}>{money(r.amount)}</span>
                  <select value={r.kind === 'transfer' ? '__transfer' : r.category_id ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setRows(rows.map((x, j) => (j === i ? { ...x, kind: v === '__transfer' ? 'transfer' : x.amount > 0 ? 'income' : 'expense', category_id: v && v !== '__transfer' ? v : null } : x)))
                    }}
                    className={`field col-span-3 !py-1.5 text-sm sm:col-span-1 ${r.category_id || r.kind === 'transfer' ? '' : '!bg-gold/10'}`}>
                    <option value="">Categoria…</option>
                    <option value="__transfer">Giroconto tra miei conti</option>
                    {exp.filter((c) => c.kind === (r.amount > 0 ? 'income' : 'expense')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
            {rows.length > 300 && <p className="px-4 py-3 text-sm text-muted">Mostro le prime 300 righe; verranno importate tutte quelle selezionate.</p>}
          </div>
        </section>
      )}
    </div>
  )
}

function ColSelect({ label, value, headers, onChange, optional }: { label: string; value?: string; headers: string[]; onChange: (v: string | undefined) => void; optional?: boolean }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select className="field" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        {optional && <option value="">Nessuna</option>}
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  )
}
