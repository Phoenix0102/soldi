import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, LogOut, Plus, Trash2, Lock, KeyRound, ScanFace, Link2, Tags, Database, ChevronRight, GraduationCap, FileBarChart, Upload, Sparkles, Check, BarChart3, Repeat, CalendarHeart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAccounts, useCategories, useRules, useTable, useTransactions } from '../lib/data'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { clearPin, hasPin, lockMinutes, setLockMinutes } from '../auth/pin'
import { PinSetup } from '../auth/Gate'
import { Link } from '../components/nav'
import { Badge, COLORS, ICON_NAMES, Icon } from '../components/Icon'
import { Label, PageHeader, Segmented, Sheet, useToast } from '../components/ui'
import type { Category, Rule } from '../lib/types'
import { ApplePaySetup } from '../components/ApplePaySetup'
import { NotifySetup } from '../components/NotifySetup'
import { BankSetup } from '../components/BankSetup'
import { useParams } from 'react-router-dom'
import { BackButton } from '../components/back'
import { haptic } from '../lib/motion'
import { bioAvailable, bioEnabled, disableBio, enableBio } from '../lib/biometric'

const SECTIONS = [
  { id: 'sicurezza', title: 'Sicurezza', text: 'PIN, Face ID, chiave di accesso', icon: Lock, color: '#0f4d3a' },
  { id: 'collegamenti', title: 'Collegamenti', text: 'Notifiche, Apple Pay, AI, banche', icon: Link2, color: '#2563eb' },
  { id: 'categorie', title: 'Categorie e regole', text: 'Come vengono smistati i movimenti', icon: Tags, color: '#a87b22' },
  { id: 'dati', title: 'I tuoi dati', text: 'Importa, esporta, backup', icon: Database, color: '#7c3aed' },
] as const

export default function SettingsPage() {
  const { section } = useParams()
  const current = SECTIONS.find((x) => x.id === section)
  if (current) {
    return (
      <div>
        <BackButton label="Impostazioni" fallback="/impostazioni" always />
        <PageHeader title={current.title} />
        <div className="space-y-10">
          {current.id === 'sicurezza' && <SecuritySection />}
          {current.id === 'collegamenti' && <><NotifySetup /><AiSetup /><div id="applepay"><ApplePaySetup /></div><BankSetup /></>}
          {current.id === 'categorie' && <><CategoriesSection /><RulesSection /></>}
          {current.id === 'dati' && <DataSection />}
        </div>
      </div>
    )
  }
  return <SettingsHome />
}

function SettingsHome() {
  const [theme, setT] = useState<Theme>(getTheme())
  return (
    <div>
      <BackButton label="Home" fallback="/" />
      <PageHeader title="Impostazioni" />
      <div className="space-y-8">
        <Section title="Aspetto">
          <Segmented value={theme} onChange={(t) => { setT(t); setTheme(t); haptic('tick') }}
            options={[{ value: 'system', label: 'Automatico' }, { value: 'light', label: 'Chiaro' }, { value: 'dark', label: 'Scuro' }]} />
        </Section>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
          {SECTIONS.map(({ id, title, text, icon: I, color }) => (
            <li key={id}>
              <Link to={`/impostazioni/${id}`} className="press flex items-center gap-3.5 px-4 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}><I size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="block truncate text-sm text-muted">{text}</span></span>
                <ChevronRight size={18} className="text-faint" />
              </Link>
            </li>
          ))}
        </ul>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
          {([['/consulente', 'Consulente AI', Sparkles], ['/statistiche', 'Statistiche', BarChart3], ['/abbonamenti', 'Abbonamenti', Repeat], ['/anno', 'Il tuo anno', CalendarHeart]] as const).map(([to, label, I]) => (
            <li key={to}>
              <Link to={to} className="press flex items-center gap-3.5 px-4 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><I size={18} /></span>
                <span className="flex-1 font-medium">{label}</span><ChevronRight size={18} className="text-faint" />
              </Link>
            </li>
          ))}
          <li>
            <Link to="/impara" className="press flex items-center gap-3.5 px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><GraduationCap size={18} /></span>
              <span className="flex-1 font-medium">Impara</span><ChevronRight size={18} className="text-faint" />
            </Link>
          </li>
          <li>
            <Link to="/resoconto" className="press flex items-center gap-3.5 px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><FileBarChart size={18} /></span>
              <span className="flex-1 font-medium">Resoconto mensile</span><ChevronRight size={18} className="text-faint" />
            </Link>
          </li>
        </ul>
        <p className="text-center text-xs text-faint">Soldi · fatto su misura per Jacopo</p>
      </div>
    </div>
  )
}

function SecuritySection() {
  const toast = useToast()
  const [pinOn, setPinOn] = useState(hasPin())
  const [pinSetup, setPinSetup] = useState(false)
  const [lock, setLock] = useState(lockMinutes())
  const [pwOpen, setPwOpen] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [bioOn, setBioOn] = useState(bioEnabled())
  useEffect(() => { bioAvailable().then(setBioOk) }, [])

  if (pinSetup) return createPortal(<div className="fixed inset-0 z-[70]"><PinSetup onDone={() => { setPinSetup(false); setPinOn(hasPin()); toast('PIN impostato') }} /></div>, document.body)

  return (
    <>
      <div className="divide-y divide-line rounded-3xl bg-surface">
        <Row icon={<Lock size={18} />} title="PIN di sblocco" text={pinOn ? 'Attivo su questo dispositivo' : 'Disattivato: chiunque usi questo dispositivo vede i tuoi dati'}>
          <div className="flex gap-2">
            <button className="btn btn-ghost !py-1.5" onClick={() => setPinSetup(true)}>{pinOn ? 'Cambia' : 'Attiva'}</button>
            {pinOn && <button className="btn btn-ghost !py-1.5" onClick={() => { clearPin(); setPinOn(false); toast('PIN disattivato') }}>Disattiva</button>}
          </div>
        </Row>
        {pinOn && (
          <Row title="Blocca dopo" text="Minuti di inattività prima di richiedere il PIN">
            <select className="field !w-auto !py-1.5" value={lock} onChange={(e) => { setLock(+e.target.value); setLockMinutes(+e.target.value) }}>
              {[1, 2, 5, 10, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </Row>
        )}
        {bioOk && pinOn && (
          <Row icon={<ScanFace size={18} />} title="Face ID" text={bioOn ? 'Sblocchi l\'app senza digitare il PIN' : 'Al posto del PIN, che resta come riserva'}>
            <button className="btn btn-ghost !py-1.5" onClick={async () => {
              if (bioOn) { disableBio(); setBioOn(false); toast('Face ID disattivato'); return }
              try { await enableBio(); setBioOn(true); toast('Face ID attivo') } catch { toast('Attivazione annullata', { tone: 'err' }) }
            }}>{bioOn ? 'Disattiva' : 'Attiva'}</button>
          </Row>
        )}
        <Row icon={<KeyRound size={18} />} title="Chiave di accesso" text="Serve per collegare un nuovo dispositivo">
          <button className="btn btn-ghost !py-1.5" onClick={() => setPwOpen(true)}>Cambia</button>
        </Row>
        <Row icon={<LogOut size={18} />} title="Esci da questo dispositivo" text="Per rientrare servirà la chiave di accesso">
          <button className="btn btn-danger !py-1.5" onClick={async () => { await supabase.auth.signOut(); localStorage.removeItem('soldi-pin') }}>Esci</button>
        </Row>
      </div>
      {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
    </>
  )
}

function DataSection() {
  return (
    <>
      <Section title="Importa" text="Estratti conto in CSV o Excel dall'home banking.">
        <Link to="/importa" className="btn btn-primary"><Upload size={17} /> Importa estratto conto</Link>
      </Section>
      <ExportSection />
      <p className="text-sm text-muted"><Link to="/benvenuto" className="underline underline-offset-4">Rifai la configurazione guidata</Link></p>
    </>
  )
}

/** Chiave API di Anthropic per i suggerimenti di categoria (resta sul server). */
function AiSetup() {
  const toast = useToast()
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['ai-status'], queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('categorize', { body: { action: 'status' } })
    if (error) throw error
    return data as { configured: boolean }
  } })
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const call = async (body: Record<string, unknown>) => {
    const { error } = await supabase.functions.invoke('categorize', { body })
    if (error) {
      const ctx = (error as { context?: Response }).context
      throw new Error((ctx ? await ctx.json().then((j) => j.error).catch(() => null) : null) ?? error.message)
    }
  }
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} /> Categorizzazione con l'AI</h2>
        <p className="text-sm text-muted">Quando nessuna regola riconosce un esercente, Claude propone la categoria. Decidi sempre tu se accettarla.</p>
      </div>
      <div className="space-y-3 rounded-3xl bg-surface p-5">
        {status.isLoading ? <p className="text-sm text-muted">Controllo…</p> : status.data?.configured ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm"><Check size={16} className="text-pos" /> Attiva. La trovi in Smista.</p>
            <button className="btn btn-ghost !py-1.5" onClick={async () => { await call({ action: 'forget' }); qc.invalidateQueries({ queryKey: ['ai-status'] }); toast('Chiave rimossa') }}>Rimuovi chiave</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">Crea una chiave su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">console.anthropic.com</a> e incollala qui. Il costo è di pochi centesimi al mese.</p>
            <div className="flex gap-2">
              <input className="field flex-1" type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
              <button className="btn btn-primary" disabled={busy || key.trim().length < 20} onClick={async () => {
                setBusy(true)
                try { await call({ action: 'configure', key }); setKey(''); qc.invalidateQueries({ queryKey: ['ai-status'] }); toast('Suggerimenti AI attivi') }
                catch (e) { toast((e as Error).message, { tone: 'err' }) }
                finally { setBusy(false) }
              }}>{busy ? 'Verifico…' : 'Salva'}</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Section({ title, text, children, right }: { title: string; text?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div><h2 className="text-lg font-semibold">{title}</h2>{text && <p className="text-sm text-muted">{text}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Row({ icon, title, text, children }: { icon?: React.ReactNode; title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      {icon && <span className="text-muted">{icon}</span>}
      <div className="min-w-0 flex-1"><p className="font-medium">{title}</p>{text && <p className="text-sm text-muted">{text}</p>}</div>
      {children}
    </div>
  )
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [a, setA] = useState(''), [b, setB] = useState('')
  const ok = a.length >= 8 && a === b
  return (
    <Sheet open onClose={onClose} title="Nuova chiave di accesso">
      <p className="mb-4 text-sm text-muted">Almeno 8 caratteri. Salvala nel gestore password: senza chiave non potrai collegare nuovi dispositivi.</p>
      <div className="space-y-3">
        <input type="password" className="field" placeholder="Nuova chiave" value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" />
        <input type="password" className="field" placeholder="Ripeti la chiave" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
      </div>
      <button disabled={!ok} className="btn btn-primary mt-5 w-full py-3.5" onClick={async () => {
        const { error } = await supabase.auth.updateUser({ password: a })
        if (error) return toast(`Non riuscito: ${error.message}`, { tone: 'err' })
        toast('Chiave di accesso aggiornata'); onClose()
      }}>Salva chiave</button>
    </Sheet>
  )
}

function CategoriesSection() {
  const { data: categories = [] } = useCategories()
  const [edit, setEdit] = useState<Category | 'new' | null>(null)
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const list = categories.filter((c) => c.kind === kind)
  return (
    <Section title="Categorie" right={<button className="btn btn-ghost !py-1.5" onClick={() => setEdit('new')}><Plus size={16} /> Nuova</button>}>
      <Segmented value={kind} onChange={setKind} className="mb-3" options={[{ value: 'expense', label: 'Uscite' }, { value: 'income', label: 'Entrate' }]} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((c) => (
          <button key={c.id} onClick={() => setEdit(c)} className={`flex items-center gap-3 rounded-2xl bg-surface p-3 text-left hover:bg-sunken ${c.archived ? 'opacity-40' : ''}`}>
            <Badge icon={c.icon} color={c.color} size={34} />
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.name}</span>{(c.group_name || c.deductible) && <span className="block truncate text-xs text-muted">{[c.group_name, c.deductible && '730'].filter(Boolean).join(' · ')}</span>}</span>
          </button>
        ))}
      </div>
      {edit && <CategoryForm cat={edit === 'new' ? undefined : edit} kind={kind} onClose={() => setEdit(null)} />}
    </Section>
  )
}

function CategoryForm({ cat, kind, onClose }: { cat?: Category; kind: 'expense' | 'income'; onClose: () => void }) {
  const { insert, update } = useTable<Category & Record<string, unknown>>('categories')
  const { data: categories = [] } = useCategories()
  const toast = useToast()
  const [name, setName] = useState(cat?.name ?? '')
  const [icon, setIcon] = useState(cat?.icon ?? 'circle')
  const [color, setColor] = useState(cat?.color ?? COLORS[4])
  const [group, setGroup] = useState(cat?.group_name ?? '')
  const [deductible, setDeductible] = useState(!!cat?.deductible)
  const groups = [...new Set(categories.filter((c) => c.kind === 'expense').map((c) => c.group_name).filter(Boolean))] as string[]
  const save = async () => {
    if (!name.trim()) return
    const isExp = (cat?.kind ?? kind) === 'expense'
    const row = { name: name.trim(), icon, color, group_name: isExp ? group.trim() || null : null, deductible: isExp && deductible }
    if (cat) await update.mutateAsync({ id: cat.id, ...row }); else await insert.mutateAsync({ ...row, kind, sort: 100 })
    toast(cat ? 'Categoria aggiornata' : 'Categoria creata'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={cat ? 'Modifica categoria' : 'Nuova categoria'}>
      <div className="space-y-4">
        <div className="flex items-center gap-3"><Badge icon={icon} color={color} size={48} /><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" autoFocus /></div>
        {(cat?.kind ?? kind) === 'expense' && (
          <label className="block"><Label>Gruppo</Label>
            <input className="field" list="cat-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Es. Casa" />
            <datalist id="cat-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </label>
        )}
        {(cat?.kind ?? kind) === 'expense' && (
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-sunken px-4 py-3">
            <span><span className="block text-sm font-medium">Detraibile nel 730</span><span className="block text-xs text-muted">Es. visite mediche, farmaci, università, sport dei figli: le trovi in Statistiche › 730</span></span>
            <input type="checkbox" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" />
          </label>
        )}
        <div><Label>Icona</Label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_NAMES.map((i) => <button key={i} onClick={() => setIcon(i)} aria-label={i} className={`flex h-9 w-9 items-center justify-center rounded-full ${icon === i ? 'bg-ink text-paper' : 'bg-sunken'}`}><Icon name={i} size={16} /></button>)}
          </div>
        </div>
        <div><Label>Colore</Label>
          <div className="flex flex-wrap gap-2">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={`Colore ${c}`} className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`} style={{ background: c }} />)}</div>
        </div>
        <div className="flex gap-3 pt-2">
          {cat && <button className="btn btn-ghost" onClick={async () => { await update.mutateAsync({ id: cat.id, archived: !cat.archived }); toast(cat.archived ? 'Categoria ripristinata' : 'Categoria nascosta'); onClose() }}>{cat.archived ? 'Ripristina' : 'Nascondi'}</button>}
          <button className="btn btn-primary flex-1 py-3.5" onClick={save}>Salva</button>
        </div>
      </div>
    </Sheet>
  )
}

function RulesSection() {
  const { data: rules = [] } = useRules()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { insert, remove } = useTable<Rule & Record<string, unknown>>('rules')
  const toast = useToast()
  const [pattern, setPattern] = useState('')
  const [target, setTarget] = useState('')
  const [q, setQ] = useState('')
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const accMap = new Map(accounts.map((a) => [a.id, a]))
  const debts = accounts.filter((a) => a.type === 'debt' && !a.archived)
  const label = (r: Rule) => r.action === 'transfer' ? 'Giroconto' : r.action === 'debt' ? `Rata · ${accMap.get(r.target_account_id ?? '')?.name ?? 'debito'}` : catMap.get(r.category_id ?? '')?.name ?? '—'
  const shown = rules.filter((r) => !q || r.pattern.toLowerCase().includes(q.toLowerCase()) || label(r).toLowerCase().includes(q.toLowerCase()))
  const add = async () => {
    const row: Pick<Rule, 'action' | 'category_id' | 'target_account_id'> = target === 'transfer' ? { action: 'transfer', category_id: null, target_account_id: null }
      : target.startsWith('debt:') ? { action: 'debt', category_id: null, target_account_id: target.slice(5) }
      : { action: 'category', category_id: target, target_account_id: null }
    await insert.mutateAsync({ pattern: pattern.trim().toUpperCase(), priority: 10, ...row })
    setPattern(''); toast('Regola aggiunta')
  }
  return (
    <Section title="Regole automatiche" text="Se la descrizione contiene il testo, il movimento viene categorizzato, segnato come giroconto o usato come rata di un debito. Valgono per import e inserimento rapido.">
      <div className="flex flex-wrap gap-2 rounded-3xl bg-surface p-4">
        <input className="field min-w-40 flex-1" placeholder="Se contiene… es. ESSELUNGA" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <select className="field min-w-40 flex-1" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Cosa fare…</option>
          <option value="transfer">↔ Giroconto tra miei conti</option>
          {debts.map((d) => <option key={d.id} value={`debt:${d.id}`}>Rata di {d.name}</option>)}
          <optgroup label="Uscite">{categories.filter((c) => !c.archived && c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          <optgroup label="Entrate">{categories.filter((c) => !c.archived && c.kind === 'income').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
        </select>
        <button className="btn btn-primary" disabled={!pattern.trim() || !target} onClick={add}><Plus size={16} /> Aggiungi</button>
      </div>
      <input className="field mt-3" placeholder={`Cerca tra ${rules.length} regole`} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto overscroll-contain rounded-3xl bg-surface">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <code className="flex-1 truncate font-medium">{r.pattern.trim()}</code>
            <span className={`truncate ${r.action === 'category' ? 'text-muted' : 'text-brand'}`}>{label(r)}</span>
            <button onClick={() => remove.mutate(r.id)} className="rounded-full p-1.5 text-faint hover:bg-sunken hover:text-neg" aria-label={`Elimina regola ${r.pattern}`}><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function ExportSection() {
  const { data: txs = [] } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const toast = useToast()
  const download = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
  }
  const csv = () => {
    const acc = new Map(accounts.map((a) => [a.id, a.name])), cat = new Map(categories.map((c) => [c.id, c.name]))
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = ['Data;Conto;Tipo;Categoria;Descrizione;Importo;Note',
      ...txs.map((t) => [t.date, esc(acc.get(t.account_id) ?? ''), t.kind === 'expense' ? 'Uscita' : t.kind === 'income' ? 'Entrata' : 'Giroconto', esc(cat.get(t.category_id ?? '') ?? ''), esc(t.description), t.amount.toFixed(2).replace('.', ','), esc(t.notes ?? '')].join(';'))]
    download(`movimenti-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\n'), 'text/csv')
  }
  const backup = async () => {
    const tables = ['accounts', 'categories', 'transactions', 'balance_snapshots', 'budgets', 'goals', 'recurring', 'rules', 'import_profiles', 'learn_progress']
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() }
    for (const t of tables) {
      const { data, error } = await supabase.from(t).select('*').limit(100000)
      if (error) return toast(`Backup non riuscito su ${t}`, { tone: 'err' })
      out[t] = data
    }
    download(`soldi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), 'application/json')
  }
  return (
    <Section title="I tuoi dati" text="Sono tuoi: scaricali quando vuoi.">
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-ghost" onClick={csv}><Download size={17} /> Movimenti in CSV (Excel)</button>
        <button className="btn btn-ghost" onClick={backup}><Download size={17} /> Backup completo (JSON)</button>
      </div>
    </Section>
  )
}
