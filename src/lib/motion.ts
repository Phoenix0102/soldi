import { isNative } from './native'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

type Feel = 'tick' | 'light' | 'success' | 'warning'

/** Feedback tattile: Taptic Engine nell'app iOS, vibrazione breve su Android, niente altrove. */
export function haptic(feel: Feel = 'light') {
  if (reducedMotion()) return
  if (isNative()) {
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (feel === 'tick') Haptics.selectionChanged().catch(() => {})
      else if (feel === 'success') Haptics.notification({ type: NotificationType.Success }).catch(() => {})
      else if (feel === 'warning') Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
      else Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    })
    return
  }
  try { navigator.vibrate?.(feel === 'tick' ? 4 : 8) } catch { /* non supportato */ }
}

/** Ease "iOS": partenza decisa, arrivo morbido. */
export const EASE_IOS = 'cubic-bezier(.32,.72,0,1)'
