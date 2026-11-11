import { supabase } from './supabase'

export const BANK_REDIRECT = `${location.origin}${import.meta.env.BASE_URL}`

export async function bank<T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('bank', { body: { action, ...extra } })
  if (error) {
    // Il messaggio utile è nel corpo della risposta
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? await ctx.json().then((j) => j.error).catch(() => null) : null
    throw new Error(msg ?? error.message)
  }
  return data as T
}
