/** Ordine delle sezioni: decide se la transizione scorre verso destra o verso sinistra. */
const ORDER = ['/', '/movimenti', '/conti', '/piano', '/impara', '/importa', '/impostazioni']

const base = (p: string) => {
  const clean = p.split('?')[0].replace(/\/+$/, '') || '/'
  return '/' + (clean.split('/')[1] ?? '')
}

export type Dir = 'forward' | 'back' | 'fade'

export function directionFor(from: string, to: string): Dir {
  const a = from.split('?')[0].replace(/\/+$/, '') || '/'
  const b = to.split('?')[0].replace(/\/+$/, '') || '/'
  if (a === b) return 'fade'
  const ba = base(a), bb = base(b)
  if (ba === bb) return b.split('/').length > a.split('/').length ? 'forward' : 'back'
  const ia = ORDER.indexOf(ba), ib = ORDER.indexOf(bb)
  if (ia < 0 || ib < 0) return 'fade'
  return ib > ia ? 'forward' : 'back'
}

export function setDirection(d: Dir) {
  document.documentElement.dataset.dir = d
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export const supportsViewTransitions = () => typeof document !== 'undefined' && 'startViewTransition' in document

/** Piccola vibrazione di conferma su Android (iOS la ignora). */
export function haptic(ms = 8) {
  try { if (!reducedMotion()) navigator.vibrate?.(ms) } catch { /* non supportato */ }
}
