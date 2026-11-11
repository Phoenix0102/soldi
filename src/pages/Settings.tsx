import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, LogOut, Plus, Trash2, Lock, KeyRound, ScanFace } from 'lucide-react'
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
import { useSearchParams } from 'react-router-dom'
import { bioAvailable, bioEnabled, disableBio, enableBio } from '../lib/biometric'

export default function SettingsPage() {
  const toast = useToast()
  const [theme, setT] = useState<Theme>(getTheme())
  const [pinOn, setPinOn] = useState(hasPin())
  const [pinSetup, setPinSetup] = useState(false)
  const [lock, setLock] = useState(lockMinutes())
  const [pwOpen, setPwOpen] = useState(false)
  const [bioOk, setBioOk] = useState(false)
  const [bioOn, setBioOn] = useState(bioEnabled())
  const [sp] = useSearchParams()
  useEffect(() => {
    const id = sp.get('sezione')
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
  }, [sp])
  useEffect(() => { bioAvailable().then(setBioOk) }, [])

  if (pinSetup) return createPortal(<div className="fixed inset-0 z-[70]"><PinSetup onDone={() => { setPinSetup(false); setPinOn(hasPin()); toast('PIN impostato') }} /></div>, document.body)

  return (
    <div>
      <PageHeader title="Impostazioni" />
      <div className="space-y-10">
        <Section title="Aspetto">
          <Segmented value={theme} onChange={(t) => { setT(t); setTheme(t) }}
            options={[{ value: 'system', label: 'Automatico' }, { value: 'light', label: 'Chiaro' }, { value: 'dark', label: 'Scuro' }]} />
        </Section>

        <Section title="Sicurezza">
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
              <Row icon={<ScanFace size={18} />} title="Face ID o impronta" text={bioOn ? 'Sblocchi l\'app senza digitare il PIN' : 'Al posto del PIN, che resta come riserva'}>
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
        </Section>

        <BankSetup />
        <NotifySetup />
        <div id="applepay"><ApplePaySetup /></div>
        <CategoriesSection />
        <RulesSection />
        <ExportSection />
        <p className="text-sm text-muted"><Link to="/benvenuto" className="underline underline-offset-4">Rifai la configurazione guidata</Link></p>
      </div>
      {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
    </div>
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
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.name}</span>{c.group_name && <span className="block truncate text-xs text-muted">{c.group_name}</span>}</span>
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
  const groups = [...new Set(categories.filter((c) => c.kind === 'expense').map((c) => c.group_name).filter(Boolean))] as string[]
  const save = async () => {
    if (!name.trim()) return
    const row = { name: name.trim(), icon, color, group_name: (cat?.kind ?? kind) === 'expense' ? group.trim() || null : null }
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
  const { insert, remove } = useTable<Rule & Record<string, unknown>>('rules')
  const toast = useToast()
  const [pattern, setPattern] = useState('')
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const shown = rules.filter((r) => !q || r.pattern.toLowerCase().includes(q.toLowerCase()) || catMap.get(r.category_id ?? '')?.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Section title="Regole automatiche" text="Se la descrizione di un movimento contiene il testo, gli assegno la categoria. Valgono per l'import e per l'inserimento rapido.">
      <div className="flex flex-wrap gap-2 rounded-3xl bg-surface p-4">
        <input className="field min-w-40 flex-1" placeholder="Se contiene… es. ESSELUNGA" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <select className="field min-w-40 flex-1" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Categoria…</option>
          {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.kind === 'income' ? 'Entrata: ' : ''}{c.name}</option>)}
        </select>
        <button className="btn btn-primary" disabled={!pattern.trim() || !cat} onClick={async () => {
          await insert.mutateAsync({ pattern: pattern.trim().toUpperCase(), category_id: cat, priority: 10 }); setPattern(''); toast('Regola aggiunta')
        }}><Plus size={16} /> Aggiungi</button>
      </div>
      <input className="field mt-3" placeholder={`Cerca tra ${rules.length} regole`} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto rounded-3xl bg-surface">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <code className="flex-1 truncate font-medium">{r.pattern.trim()}</code>
            <span className="text-muted">{catMap.get(r.category_id ?? '')?.name ?? '—'}</span>
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
