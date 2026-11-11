import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { it } from 'date-fns/locale'

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions)
const eur0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions)
const pct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 0 })

export const money = (n: number, round = false) => (round ? eur0 : eur).format(n || 0)
export const signedMoney = (n: number) => (n > 0 ? '+' : '') + money(n)
export const percent = (n: number) => pct.format(Number.isFinite(n) ? n : 0)

export const todayISO = () => format(new Date(), 'yyyy-MM-dd')
export const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function dayLabel(dateIso: string) {
  const d = parseISO(dateIso)
  if (isToday(d)) return 'Oggi'
  if (isYesterday(d)) return 'Ieri'
  return format(d, 'EEEE d MMMM', { locale: it })
}
export const shortDate = (dateIso: string) => format(parseISO(dateIso), 'd MMM', { locale: it })
export const longDate = (dateIso: string) => format(parseISO(dateIso), 'd MMMM yyyy', { locale: it })
export const monthLabel = (d: Date) => format(d, 'MMMM yyyy', { locale: it })
export const monthShort = (d: Date) => format(d, 'MMM', { locale: it })

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Interpreta un importo scritto all'italiana o all'inglese: "1.234,56" "1,234.56" "-12,5" "€ 3" */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw).trim().replace(/[€\s ]/g, '').replace(/EUR/i, '')
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1) }
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma > -1) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -Math.abs(n) : n
}
