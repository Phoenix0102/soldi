import { supabase } from './supabase'
import { isNative } from './native'
import { navigateTo } from './navigate'

const KEY = import.meta.env.VITE_VAPID_PUBLIC as string

export const isStandalone = () => isNative() ||
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const pushSupported = () => isNative() || 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/* App iOS: notifiche native tramite APNs. Il token del dispositivo va in push_subscriptions con endpoint "apns:<token>". */
const APNS = 'soldi-apns'
const pushPlugin = async () => (await import('@capacitor/push-notifications')).PushNotifications

async function nativeToken() {
  const P = await pushPlugin()
  await P.removeAllListeners()
  return new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Apple non ha risposto: riprova tra poco')), 20_000)
    P.addListener('registration', ({ value }) => { clearTimeout(t); resolve(value) })
    P.addListener('registrationError', ({ error }) => { clearTimeout(t); reject(new Error(`Registrazione non riuscita: ${error}`)) })
    P.register()
  })
}

async function enableNativePush() {
  const P = await pushPlugin()
  const perm = await P.requestPermissions()
  if (perm.receive !== 'granted') throw new Error('Permesso negato: puoi riattivarlo da Impostazioni › Soldi › Notifiche')
  const token = await nativeToken()
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: `apns:${token}`, p256dh: '', auth: '', device: 'iPhone (app nativa)' }, { onConflict: 'endpoint' })
  if (error) throw error
  localStorage.setItem(APNS, token)
  listenNativeTaps()
}

/** Tocco su una notifica: apre la sezione indicata. */
export async function listenNativeTaps() {
  if (!isNative() || !localStorage.getItem(APNS)) return
  const P = await pushPlugin()
  P.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = (notification.data as { url?: string } | undefined)?.url
    if (url) navigateTo(url)
  })
}

/** Il token APNs può cambiare: all'avvio lo riallinea in silenzio. */
export async function refreshNativeToken() {
  const old = localStorage.getItem(APNS)
  if (!isNative() || !old) return
  try {
    const P = await pushPlugin()
    if ((await P.checkPermissions()).receive !== 'granted') return
    const token = await nativeToken()
    if (token !== old) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', `apns:${old}`)
      await supabase.from('push_subscriptions').upsert({ endpoint: `apns:${token}`, p256dh: '', auth: '', device: 'iPhone (app nativa)' }, { onConflict: 'endpoint' })
      localStorage.setItem(APNS, token)
    }
    listenNativeTaps()
  } catch { /* riprova al prossimo avvio */ }
}

export async function currentSubscription() {
  if (isNative()) return localStorage.getItem(APNS)
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Chiede il permesso e registra questo dispositivo per le notifiche. */
export async function enablePush() {
  if (isNative()) return enableNativePush()
  if (!pushSupported()) throw new Error('Questo browser non supporta le notifiche')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permesso negato: puoi riattivarlo dalle impostazioni del telefono')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(KEY) })
  const j = sub.toJSON()
  const device = `${isIOS() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer'}${isStandalone() ? ' (app)' : ''}`
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, device }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function disablePush() {
  if (isNative()) {
    const token = localStorage.getItem(APNS)
    if (token) await supabase.from('push_subscriptions').delete().eq('endpoint', `apns:${token}`)
    localStorage.removeItem(APNS)
    const P = await pushPlugin()
    await P.removeAllListeners()
    await P.unregister().catch(() => {})
    return
  }
  const sub = await currentSubscription()
  if (!sub || typeof sub === 'string') return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function testPush() {
  const { data, error } = await supabase.functions.invoke('notify', { body: { test: true } })
  if (error) throw error
  return data as { sent: number; devices: number; error?: string }
}
