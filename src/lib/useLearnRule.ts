import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { ruleKeyFor } from './finance'
import { useInvalidate } from './data'
import type { Rule, Transaction } from './types'

/**
 * Crea una regola "se contiene X → categoria" e la applica subito
 * ai movimenti ancora da categorizzare con lo stesso esercente.
 */
export function useLearnRule() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return async (description: string, categoryId: string) => {
    const pattern = ruleKeyFor(description)
    if (pattern.length < 3) return { pattern: '', applied: 0 }
    const rules = qc.getQueryData<Rule[]>(['rules']) ?? []
    const existing = rules.find((r) => r.pattern.trim().toUpperCase() === pattern)
    if (existing) {
      if (existing.category_id !== categoryId) await supabase.from('rules').update({ category_id: categoryId, priority: 20 }).eq('id', existing.id)
    } else {
      await supabase.from('rules').insert({ pattern, category_id: categoryId, priority: 20 })
    }
    const txs = qc.getQueryData<Transaction[]>(['transactions']) ?? []
    const targets = txs.filter((t) => !t.category_id && t.kind !== 'transfer' && ` ${t.description.toUpperCase()} `.includes(pattern))
    if (targets.length) {
      const ids = targets.map((t) => t.id)
      qc.setQueryData<Transaction[]>(['transactions'], (old = []) => old.map((t) => (ids.includes(t.id) ? { ...t, category_id: categoryId } : t)))
      await supabase.from('transactions').update({ category_id: categoryId }).in('id', ids)
    }
    invalidate('rules', 'transactions')
    return { pattern, applied: targets.length }
  }
}
