/* Navigazione da fuori da React (notifiche, link soldi://): passa dal router, non da location.hash. */
let impl: ((to: string) => void) | null = null

export function setNavigator(fn: (to: string) => void) {
  impl = fn
  ;(window as Window & { __soldiGo?: (to: string) => void }).__soldiGo = fn
}

export function navigateTo(to: string) {
  if (impl) impl(to)
  else location.hash = `#${to}`
}
