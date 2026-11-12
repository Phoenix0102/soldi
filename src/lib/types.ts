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
  wallet_match: string | null
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
  /** Spesa detraibile nel 730 */
  deductible?: boolean
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
  source: 'manual' | 'csv' | 'bank' | 'receipt' | 'shortcut'
  import_hash: string | null
  created_at: string
  goal_id?: string | null
  original_amount?: number | null
  original_currency?: string | null
}

export interface Snapshot {
  id: string
  account_id: string
  date: string
  balance: number
  created_at: string
}

/** fixed: tetto mensile · flex: si adatta, conta il totale delle flessibili · annual: importo annuo (assicurazioni, regali) */
export type BudgetKind = 'fixed' | 'flex' | 'annual'
export interface Budget { id: string; category_id: string; amount: number; kind?: BudgetKind }

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

export type RuleAction = 'category' | 'transfer' | 'debt'
export interface Rule {
  id: string
  pattern: string
  category_id: string | null
  rename_to: string | null
  priority: number
  /** category: assegna la categoria · transfer: giroconto · debt: rata verso target_account_id */
  action: RuleAction
  target_account_id: string | null
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

export interface Holding {
  id: string
  account_id: string
  symbol: string
  isin: string | null
  name: string
  quantity: number
  avg_price: number
  currency: string
  last_price: number | null
  prev_close: number | null
  last_price_at: string | null
}

export interface BankConnection { id: string; aspsp_name: string; country: string; status: 'pending' | 'active' | 'expired' | 'error'; valid_until: string | null; last_sync_at: string | null; last_error: string | null; created_at: string }
export interface BankAccount { id: string; connection_id: string; uid: string; iban: string | null; name: string | null; currency: string | null; account_id: string | null; last_sync_at: string | null }

export interface ApiToken { id: string; label: string; last_used_at: string | null; created_at: string }
export interface AppSettings { user_id: string; default_account_id: string | null; data: Record<string, unknown> }

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
