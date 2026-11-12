/* Operazioni di smistamento condivise: categorie, giroconti, rate dei debiti e regole. */
import { supabase } from './supabase'
import type { RuleAction, Transaction } from './types'

const chunks = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

export async function setCategory(ids: string[], categoryId: string) {
  for (const part of chunks(ids)) {
    const { error } = await supabase.from('transactions').update({ category_id: categoryId }).in('id', part)
    if (error) throw error
  }
}

export async function setTransfer(ids: string[]) {
  for (const part of chunks(ids)) {
    const { error } = await supabase.from('transactions').update({ kind: 'transfer', category_id: null }).in('id', part)
    if (error) throw error
  }
}

/** Ogni uscita diventa un giroconto verso il conto del debito, che così scende. */
export async function payDebt(txs: Transaction[], debtAccountId: string) {
  const outs = txs.filter((t) => t.amount < 0)
  for (const t of outs) {
    const group = t.transfer_group ?? crypto.randomUUID()
    const { error } = await supabase.from('transactions').update({ kind: 'transfer', category_id: null, transfer_group: group }).eq('id', t.id)
    if (error) throw error
    const { error: e2 } = await supabase.from('transactions').insert({
      account_id: debtAccountId, date: t.date, amount: -t.amount, description: t.description,
      kind: 'transfer', transfer_group: group, source: 'manual',
    })
    if (e2) throw e2
  }
}

/** Crea o aggiorna la regola per un esercente. */
export async function saveRule(pattern: string, action: RuleAction, categoryId: string | null, targetAccountId: string | null = null) {
  const p = pattern.trim().toUpperCase()
  if (p.length < 3) return
  const { data } = await supabase.from('rules').select('id').eq('pattern', p).maybeSingle()
  const row = { pattern: p, action, category_id: action === 'category' ? categoryId : null, target_account_id: action === 'debt' ? targetAccountId : null, priority: 20 }
  if (data?.id) await supabase.from('rules').update(row).eq('id', data.id)
  else await supabase.from('rules').insert(row)
}
