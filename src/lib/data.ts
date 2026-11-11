import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  ApiToken, AppSettings, Holding,
  Account, AccountBalance, Budget, Category, Goal, ImportProfile, LearnProgress,
  Recurring, Rule, Snapshot, Transaction,
} from './types'

type Table =
  | 'api_tokens' | 'app_settings' | 'holdings'
  | 'accounts' | 'categories' | 'transactions' | 'balance_snapshots' | 'budgets'
  | 'goals' | 'recurring' | 'rules' | 'import_profiles' | 'learn_progress'

/** Supabase restituisce max 1000 righe per richiesta: pagina finché serve. */
async function fetchAll<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const size = 1000
  let from = 0
  const out: T[] = []
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).range(from, from + size - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < size) break
    from += size
  }
  return out
}

const num = <T extends object>(rows: T[], keys: (keyof T)[]) =>
  rows.map((r) => {
    const o = { ...r }
    for (const k of keys) if (o[k] !== null && o[k] !== undefined) (o as Record<string, unknown>)[k as string] = Number(o[k])
    return o
  })

export const useAccounts = () =>
  useQuery({
    queryKey: ['accounts'],
    queryFn: async () => num(await fetchAll<Account>('accounts', 'sort'), ['initial_balance']),
  })

// In cache resta un array (serializzabile), i componenti ricevono una Map
const toMap = (rows: AccountBalance[]) => new Map(rows.map((r) => [r.account_id, r]))
export const useBalances = () =>
  useQuery({
    queryKey: ['balances'],
    queryFn: async () => num(await fetchAll<AccountBalance>('account_balances', 'account_id'), ['balance']),
    select: toMap,
  })

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => fetchAll<Category>('categories', 'sort') })

export const useTransactions = () =>
  useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const rows = num(await fetchAll<Transaction>('transactions', 'date', false), ['amount'])
      return rows.sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)))
    },
  })

export const useSnapshots = () =>
  useQuery({ queryKey: ['balance_snapshots'], queryFn: async () => num(await fetchAll<Snapshot>('balance_snapshots', 'date'), ['balance']) })
export const useBudgets = () =>
  useQuery({ queryKey: ['budgets'], queryFn: async () => num(await fetchAll<Budget>('budgets', 'created_at'), ['amount']) })
export const useGoals = () =>
  useQuery({ queryKey: ['goals'], queryFn: async () => num(await fetchAll<Goal>('goals', 'created_at'), ['target_amount', 'saved_amount']) })
export const useRecurring = () =>
  useQuery({ queryKey: ['recurring'], queryFn: async () => num(await fetchAll<Recurring>('recurring', 'next_date'), ['amount']) })
export const useRules = () =>
  useQuery({ queryKey: ['rules'], queryFn: () => fetchAll<Rule>('rules', 'priority', false) })
export const useImportProfiles = () =>
  useQuery({ queryKey: ['import_profiles'], queryFn: () => fetchAll<ImportProfile>('import_profiles', 'created_at') })
export const useApiTokens = () =>
  useQuery({ queryKey: ['api_tokens'], queryFn: async () => {
    const { data, error } = await supabase.from('api_tokens').select('id,label,last_used_at,created_at').order('created_at')
    if (error) throw error
    return data as ApiToken[]
  } })
export const useAppSettings = () =>
  useQuery({ queryKey: ['app_settings'], queryFn: async () => {
    const { data, error } = await supabase.from('app_settings').select('*').maybeSingle()
    if (error) throw error
    return (data as AppSettings | null)
  } })
export const useHoldings = () =>
  useQuery({ queryKey: ['holdings'], queryFn: async () => num(await fetchAll<Holding>('holdings', 'created_at'), ['quantity', 'avg_price', 'last_price', 'prev_close']) })
export const useLearnProgress = () =>
  useQuery({ queryKey: ['learn_progress'], queryFn: () => fetchAll<LearnProgress>('learn_progress', 'completed_at') })

const AFFECTS: Record<Table, string[]> = {
  api_tokens: ['api_tokens'],
  holdings: ['holdings', 'balances', 'balance_snapshots'],
  app_settings: ['app_settings'],
  accounts: ['accounts', 'balances'],
  categories: ['categories'],
  transactions: ['transactions', 'balances'],
  balance_snapshots: ['balance_snapshots', 'balances'],
  budgets: ['budgets'],
  goals: ['goals'],
  recurring: ['recurring'],
  rules: ['rules'],
  import_profiles: ['import_profiles'],
  learn_progress: ['learn_progress'],
}

export function useInvalidate() {
  const qc = useQueryClient()
  return (...tables: Table[]) => {
    const keys = new Set(tables.flatMap((t) => AFFECTS[t]))
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  }
}

/** Mutazione generica: insert / update / delete / upsert su una tabella. */
export function useTable<T extends Record<string, unknown>>(table: Table) {
  const invalidate = useInvalidate()
  const done = () => invalidate(table)
  const insert = useMutation({
    mutationFn: async (rows: Partial<T> | Partial<T>[]) => {
      const { data, error } = await supabase.from(table).insert(rows as never).select()
      if (error) throw error
      return data as unknown as T[]
    },
    onSuccess: done,
  })
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<T> & { id: string }) => {
      const { error } = await supabase.from(table).update(patch as never).eq('id', id)
      if (error) throw error
    },
    onSuccess: done,
  })
  const remove = useMutation({
    mutationFn: async (id: string | string[]) => {
      const ids = Array.isArray(id) ? id : [id]
      const { error } = await supabase.from(table).delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: done,
  })
  const upsert = useMutation({
    mutationFn: async ({ rows, onConflict }: { rows: Partial<T> | Partial<T>[]; onConflict?: string }) => {
      const { error } = await supabase.from(table).upsert(rows as never, { onConflict })
      if (error) throw error
    },
    onSuccess: done,
  })
  return { insert, update, remove, upsert }
}
