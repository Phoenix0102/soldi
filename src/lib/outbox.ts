/* Movimenti salvati senza connessione: restano sul telefono e partono appena torna la rete. */
import { supabase } from './supabase'

const KEY = 'soldi-outbox'
type Job = { kind: 'insert'; rows: Record<string, unknown>[] } | { kind: 'delete'; ids: string[] }

const read = (): Job[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
const write = (jobs: Job[]) => (jobs.length ? localStorage.setItem(KEY, JSON.stringify(jobs)) : localStorage.removeItem(KEY))

export const pendingCount = () => read().reduce((n, j) => n + (j.kind === 'insert' ? j.rows.length : j.ids.length), 0)
export const isNetworkError = (e: unknown) => !navigator.onLine || /fetch|network|load failed|timed out/i.test(String((e as Error)?.message ?? e))

export function queue(job: Job) { write([...read(), job]) }

let flushing = false
/** Invia quello che è in coda. Ritorna quanti movimenti sono partiti. */
export async function flush() {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    let jobs = read()
    while (jobs.length) {
      const j = jobs[0]
      const { error } = j.kind === 'insert'
        ? await supabase.from('transactions').upsert(j.rows, { onConflict: 'id', ignoreDuplicates: true })
        : await supabase.from('transactions').delete().in('id', j.ids)
      if (error) break
      sent += j.kind === 'insert' ? j.rows.length : j.ids.length
      jobs = jobs.slice(1)
      write(jobs)
    }
  } finally { flushing = false }
  return sent
}
