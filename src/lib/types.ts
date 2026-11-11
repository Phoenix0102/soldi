export type AccountType = 'checking' | 'savings' | 'card' | 'cash' | 'wallet' | 'investment' | 'debt'
export type TxKind = 'expense' | 'income' | 'transfer'
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Account {
  id: string
  name: string
  type: AccountType
  institution: string | null
  color: string
  icon: string
  currency: string
  initial_balance: number
  include_in_networth: boolean
  archived: boolean
  sort: number
}

export interface AccountBalance {
  account_id: string
  balance: number
  snapshot_date: string | null
}

export interface Category {
  id: string
  name: string
  kind: 'expense' | 'income'
  icon: string
  color: string
  group_name: string | null
  sort: number
  archived: boolean
}

export interface Transaction {
  id: string
  account_id: string
  date: string
  amount: number
  description: string
  category_id: string | null
  notes: string | null
  kind: TxKind
  transfer_group: string | null
  recurring_id: string | null
  source: 'manual' | 'csv' | 'bank' | 'receipt'
  import_hash: string | null
  created_at: string
}

export interface Snapshot {
  id: string
  account_id: string
  date: string
  balance: number
  created_at: string
}

export interface Budget { id: string; category_id: string; amount: number }

export interface Goal {
  id: string
  name: string
  target_amount: number
  saved_amount: number
  target_date: string | null
  account_id: string | null
  icon: string
  color: string
  archived: boolean
}

export interface Recurring {
  id: string
  name: string
  amount: number
  kind: 'expense' | 'income'
  account_id: string | null
  category_id: string | null
  frequency: Frequency
  next_date: string
  match_text: string | null
  active: boolean
}

export interface Rule {
  id: string
  pattern: string
  category_id: string | null
  rename_to: string | null
  priority: number
}

export interface ImportProfile {
  id: string
  account_id: string | null
  name: string
  mapping: ImportMapping
}

export interface ImportMapping {
  date: string
  description: string
  amount?: string
  debit?: string
  credit?: string
  dateFormat: 'dmy' | 'ymd' | 'mdy'
  invert: boolean
  skipRows: number
}

export interface LearnProgress {
  lesson_id: string
  completed_at: string
  quiz_score: number | null
  quiz_total: number | null
}

export const ACCOUNT_TYPES: Record<AccountType, { label: string; liquid: boolean }> = {
  checking: { label: 'Conto corrente', liquid: true },
  savings: { label: 'Conto deposito / risparmio', liquid: true },
  card: { label: 'Carta prepagata', liquid: true },
  cash: { label: 'Contanti', liquid: true },
  wallet: { label: 'Wallet (PayPal, Satispay…)', liquid: true },
  investment: { label: 'Investimenti', liquid: false },
  debt: { label: 'Debito / rate (Klarna…)', liquid: false },
}

export const FREQUENCIES: Record<Frequency, { label: string; perMonth: number }> = {
  weekly: { label: 'Settimanale', perMonth: 52 / 12 },
  monthly: { label: 'Mensile', perMonth: 1 },
  quarterly: { label: 'Trimestrale', perMonth: 1 / 3 },
  yearly: { label: 'Annuale', perMonth: 1 / 12 },
}
