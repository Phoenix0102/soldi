const KEY = 'soldi-pin'
const SKIP = 'soldi-pin-skip'
const LOCK_AFTER = 'soldi-lock-after'

async function sha(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const hasPin = () => !!localStorage.getItem(KEY)
export const pinSkipped = () => localStorage.getItem(SKIP) === '1'
export const skipPin = () => localStorage.setItem(SKIP, '1')

export async function setPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-')
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: await sha(salt + pin) }))
  localStorage.removeItem(SKIP)
}
export function clearPin() { localStorage.removeItem(KEY); localStorage.setItem(SKIP, '1') }

export async function checkPin(pin: string) {
  const raw = localStorage.getItem(KEY)
  if (!raw) return true
  const { salt, hash } = JSON.parse(raw)
  return (await sha(salt + pin)) === hash
}

/** Minuti di inattività prima del blocco automatico. */
export const lockMinutes = () => Number(localStorage.getItem(LOCK_AFTER) ?? 5)
export const setLockMinutes = (m: number) => localStorage.setItem(LOCK_AFTER, String(m))
