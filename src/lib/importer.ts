import { sha256 } from './sha256'
import Papa from 'papaparse'
import { parseAmount } from './format'
import type { ImportMapping } from './types'

export type Grid = (string | number | Date | null)[][]

export interface FullMapping extends ImportMapping { fee?: string; state?: string; balance?: string; extra?: string }

export async function readFile(file: File): Promise<Grid> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as Grid
  }
  let text = await file.text()
  if (text.includes('�')) {
    // Molte banche italiane esportano in Windows-1252
    text = new TextDecoder('windows-1252').decode(await file.arrayBuffer())
  }
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  return res.data as Grid
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const KEYS = {
  date: ['data operazione', 'data contabile', 'data di completamento', 'completed date', 'data', 'date', 'booking date', 'data di inizio', 'started date', 'data valuta', 'value date'],
  amount: ['importo', 'importo (eur)', 'importo eur', 'amount', 'valore', 'importo in eur', 'totale'],
  debit: ['uscite', 'addebiti', 'addebito', 'dare', 'debit', 'uscita'],
  credit: ['entrate', 'accrediti', 'accredito', 'avere', 'credit', 'entrata'],
  description: ['descrizione operazione', 'descrizione', 'description', 'dettagli', 'causale', 'beneficiario', 'controparte', 'merchant', 'payee', 'concetto'],
  extra: ['causale', 'controparte', 'beneficiario', 'tipo', 'type', 'categoria'],
  fee: ['costo', 'fee', 'commissione', 'commissioni', 'spese'],
  state: ['state', 'stato'],
  balance: ['saldo', 'balance', 'saldo contabile'],
}

function pick(headers: string[], keys: string[], exclude: string[] = []) {
  for (const k of keys) {
    const i = headers.findIndex((h) => h === k && !exclude.includes(h))
    if (i > -1) return headers[i]
  }
  for (const k of keys) {
    const i = headers.findIndex((h) => h.includes(k) && !exclude.includes(h))
    if (i > -1) return headers[i]
  }
  return undefined
}

/** Trova la riga di intestazione e propone una mappatura delle colonne. */
export function detect(grid: Grid): { headerRow: number; headers: string[]; mapping: FullMapping } {
  let headerRow = 0
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const row = grid[i].map(norm)
    const hasDate = row.some((c) => /^(data|date)\b|data /.test(c))
    const hasMoney = row.some((c) => /(importo|amount|entrate|uscite|addebit|accredit|dare|avere|debit|credit)/.test(c))
    if (hasDate && hasMoney) { headerRow = i; break }
  }
  const headers = grid[headerRow].map((h, i) => norm(h) || `colonna ${i + 1}`)
  const date = pick(headers, KEYS.date) ?? headers[0]
  const amount = pick(headers, KEYS.amount)
  const debit = amount ? undefined : pick(headers, KEYS.debit)
  const credit = amount ? undefined : pick(headers, KEYS.credit)
  const description = pick(headers, KEYS.description, [date]) ?? headers[1]
  const extra = pick(headers, KEYS.extra, [description, date])
  const mapping: FullMapping = {
    date, amount, debit, credit, description, extra,
    fee: pick(headers, KEYS.fee), state: pick(headers, KEYS.state), balance: pick(headers, KEYS.balance),
    dateFormat: guessDateFormat(grid.slice(headerRow + 1).map((r) => r[headers.indexOf(date)])),
    invert: false, skipRows: headerRow,
  }
  return { headerRow, headers, mapping }
}

function guessDateFormat(values: unknown[]): ImportMapping['dateFormat'] {
  let dmy = 0, mdy = 0
  for (const v of values.slice(0, 200)) {
    if (typeof v !== 'string') continue
    if (/^\d{4}[-/.]/.test(v.trim())) return 'ymd'
    const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/)
    if (!m) continue
    if (+m[1] > 12) dmy++
    if (+m[2] > 12) mdy++
  }
  return mdy > dmy ? 'mdy' : 'dmy'
}

export function parseDate(v: unknown, fmt: ImportMapping['dateFormat']): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date && !isNaN(+v)) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000)
    return d.toISOString().slice(0, 10)
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Numero seriale di Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const [a, b] = fmt === 'mdy' ? [m[2], m[1]] : [m[1], m[2]]
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    if (+b < 1 || +b > 12 || +a < 1 || +a > 31) return null
    return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
  }
  const months: Record<string, string> = { gen: '01', feb: '02', mar: '03', apr: '04', mag: '05', giu: '06', lug: '07', ago: '08', set: '09', ott: '10', nov: '11', dic: '12', jan: '01', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', dec: '12' }
  m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})/)
  if (m && months[m[2]]) return `${m[3]}-${months[m[2]]}-${m[1].padStart(2, '0')}`
  return null
}

export interface ParsedRow { date: string; amount: number; description: string; balance: number | null; line: number }

export function extract(grid: Grid, headers: string[], map: FullMapping): { rows: ParsedRow[]; skipped: number } {
  const col = (name?: string) => (name ? headers.indexOf(name) : -1)
  const iDate = col(map.date), iDesc = col(map.description), iAmt = col(map.amount), iDeb = col(map.debit), iCre = col(map.credit)
  const iFee = col(map.fee), iState = col(map.state), iBal = col(map.balance), iExtra = col(map.extra)
  const rows: ParsedRow[] = []
  let skipped = 0
  grid.slice(map.skipRows + 1).forEach((r, idx) => {
    if (!r || r.every((c) => c === null || c === '')) return
    if (iState > -1 && /(revert|declin|annull|rifiut|pending|sospes|failed|fallit)/i.test(String(r[iState] ?? ''))) { skipped++; return }
    const date = parseDate(r[iDate], map.dateFormat)
    let amount: number | null = null
    if (iAmt > -1) amount = parseAmount(r[iAmt] as string)
    else {
      const d = iDeb > -1 ? parseAmount(r[iDeb] as string) : null
      const c = iCre > -1 ? parseAmount(r[iCre] as string) : null
      if (d) amount = -Math.abs(d)
      else if (c) amount = Math.abs(c)
    }
    if (iFee > -1) { const f = parseAmount(r[iFee] as string); if (f && amount !== null) amount -= Math.abs(f) }
    if (!date || amount === null || amount === 0) { skipped++; return }
    if (map.invert) amount = -amount
    let description = String(r[iDesc] ?? '').replace(/\s+/g, ' ').trim()
    const extra = iExtra > -1 ? String(r[iExtra] ?? '').replace(/\s+/g, ' ').trim() : ''
    if (extra && description.length < 3) description = `${description} ${extra}`.trim()
    rows.push({ date, amount: Math.round(amount * 100) / 100, description: cleanDescription(description), balance: iBal > -1 ? parseAmount(r[iBal] as string) : null, line: idx })
  })
  return { rows, skipped }
}

/** Ripulisce le descrizioni tipiche degli estratti conto italiani. */
export function cleanDescription(s: string) {
  return s
    .replace(/^(pagamento (pos|carta|tramite pos)|pagamenti? (pos|carta)|op\.?\s*pos|addebito sdd|addebito diretto|acquisto (pos|carta))\s*[-:]?\s*/i, '')
    .replace(/\b(carta|card)\s*(n\.?|nr\.?)?\s*[*x\d]{4,}\b/gi, '')
    .replace(/\b\d{2}[/.]\d{2}[/.]\d{2,4}\s*(ore\s*)?\d{0,2}[:.]?\d{0,2}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 120)
}

export async function hashRow(accountId: string, r: { date: string; amount: number; description: string }, n: number) {
  const s = `${accountId}|${r.date}|${r.amount.toFixed(2)}|${r.description.toLowerCase()}|${n}`
  // Primi 16 byte dell'hash (32 caratteri esadecimali), come prima
  return (await sha256(s)).slice(0, 32)
}
