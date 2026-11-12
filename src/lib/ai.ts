/* Chiamate alle funzioni AI (la chiave Anthropic resta sul server). */
import { supabase } from './supabase'
import { merchantKey } from './finance'
import { saveRule, setCategory, setTransfer } from './sorting'
import type { Category, Transaction } from './types'

export async function callFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    throw new Error((ctx ? await ctx.json().then((j) => j.error).catch(() => null) : null) ?? error.message)
  }
  return data as T
}

export const aiConfigured = () => callFn<{ configured: boolean }>('categorize', { action: 'status' }).then((r) => r.configured).catch(() => false)

/**
 * Categorizza con l'AI i movimenti senza categoria (raggruppati per esercente) e salva le regole,
 * così la volta dopo basta la regola. Ritorna quanti movimenti ha sistemato.
 */
export async function autoCategorize(txs: Transaction[], categories: Category[]) {
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (t.category_id || t.kind === 'transfer') continue
    const id = `${t.amount > 0 ? 'in' : 'out'}:${merchantKey(t.description)}`
    groups.set(id, [...(groups.get(id) ?? []), t])
  }
  if (!groups.size) return 0
  const list = [...groups.entries()].slice(0, 80)
  const items = list.map(([id, g]) => ({ key: id.slice(id.indexOf(':') + 1), sign: id.startsWith('in') ? 'in' : 'out', count: g.length, total: g.reduce((s, t) => s + t.amount, 0), samples: [...new Set(g.map((t) => t.description))].slice(0, 3) }))
  const { suggestions } = await callFn<{ suggestions: Record<string, string> }>('categorize', {
    action: 'suggest', items, categories: categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
  })
  let n = 0
  for (const [id, g] of list) {
    const key = id.slice(id.indexOf(':') + 1)
    const s = suggestions[key]
    if (!s) continue
    const ids = g.map((t) => t.id)
    if (s === 'transfer') { await setTransfer(ids); await saveRule(key, 'transfer', null) }
    else { await setCategory(ids, s); await saveRule(key, 'category', s) }
    n += ids.length
  }
  return n
}
