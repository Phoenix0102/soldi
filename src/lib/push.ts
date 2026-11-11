import { supabase } from './supabase'

const KEY = import.meta.env.VITE_VAPID_PUBLIC as string

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Chiede il permesso e registra questo dispositivo per le notifiche. */
export async function enablePush() {
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
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function testPush() {
  const { data, error } = await supabase.functions.invoke('notify', { body: { test: true } })
  if (error) throw error
  return data as { sent: number; devices: number }
}
