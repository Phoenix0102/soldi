/* Sblocco con Face ID / impronta.
   Nel browser tramite WebAuthn, nell'app iOS con Face ID nativo.
   È un blocco locale come il PIN: la credenziale resta nel portachiavi del dispositivo. */
import { isNative } from './native'

const KEY = 'soldi-bio'
const NATIVE = 'native'

import { registerPlugin } from '@capacitor/core'

type AuthStatus = { available: boolean; type: 'faceid' | 'touchid' | 'none'; problem: string; message: string }
type AuthResult = { ok: boolean; code: number; message: string }
// Plugin nativo dell'app (MainViewController.swift); quello esterno resta come riserva
const SoldiAuth = registerPlugin<{ status(): Promise<AuthStatus>; verify(o: { reason: string }): Promise<AuthResult> }>('SoldiAuth')
const nativeBio = async () => (await import('@capgo/capacitor-native-biometric')).NativeBiometric

/** Una chiamata nativa che non risponde non deve mai bloccare l'app. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}: nessuna risposta`)), ms))])
}

async function nativeStatus(): Promise<AuthStatus> {
  try { return await withTimeout(SoldiAuth.status(), 2500, 'SoldiAuth') } catch (e) {
    // Riserva: libreria esterna
    const r = await withTimeout((await nativeBio()).isAvailable({ useFallback: false }), 2500, 'NativeBiometric') as { isAvailable: boolean; biometryType: number; errorCode?: number }
    return { available: r.isAvailable, type: r.biometryType === 1 ? 'touchid' : r.biometryType === 2 ? 'faceid' : 'none', problem: r.isAvailable ? '' : r.errorCode === 3 ? 'not-enrolled' : r.errorCode === 2 ? 'lockout' : 'denied', message: `riserva (${(e as Error).message})` }
  }
}

async function nativeVerify(reason: string): Promise<boolean> {
  try {
    const r = await SoldiAuth.verify({ reason })
    return r.ok
  } catch {
    try { await (await nativeBio()).verifyIdentity({ reason, useFallback: false }); return true } catch { return false }
  }
}

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

// Nell'app iOS Face ID è attivo di default (si può spegnere); nel browser va attivato
export const bioEnabled = () => isNative() ? localStorage.getItem(KEY) !== 'off' : !!localStorage.getItem(KEY)

export async function bioAvailable() {
  try {
    if (isNative()) return (await nativeStatus()).available
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch { return false }
}

export async function enableBio() {
  if (isNative()) {
    if (!await nativeVerify('Attiva lo sblocco di Soldi con Face ID')) throw new Error('Face ID non confermato')
    localStorage.setItem(KEY, NATIVE)
    return
  }
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'Soldi', id: location.hostname },
      user: { id: random(16), name: 'soldi', displayName: 'Soldi' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Registrazione annullata')
  localStorage.setItem(KEY, toB64(cred.rawId))
}

export const disableBio = () => (isNative() ? localStorage.setItem(KEY, 'off') : localStorage.removeItem(KEY))

export async function verifyBio() {
  const id = localStorage.getItem(KEY)
  if (isNative()) {
    if (id === 'off') return false
    return nativeVerify('Sblocca Soldi')
  }
  if (!id || id === NATIVE) return false
  try {
    const res = await navigator.credentials.get({
      publicKey: { challenge: random(32), allowCredentials: [{ type: 'public-key', id: fromB64(id) }], userVerification: 'required', timeout: 60000, rpId: location.hostname },
    })
    return !!res
  } catch { return false }
}

export type BioStatus = { available: boolean; type: 'faceid' | 'touchid' | null; problem: 'denied' | 'not-enrolled' | 'lockout' | 'no-passcode' | 'error' | null; detail?: string }

/** Stato dettagliato: serve a spiegare perché Face ID non è disponibile (permesso negato, non configurato…). */
export async function bioStatus(): Promise<BioStatus> {
  if (!isNative()) return { available: await bioAvailable(), type: null, problem: null }
  try {
    const r = await nativeStatus()
    const type = r.type === 'none' ? null : r.type
    if (r.available) return { available: true, type, problem: null, detail: r.message || undefined }
    const problem = (['denied', 'not-enrolled', 'lockout', 'no-passcode'].includes(r.problem) ? r.problem : 'error') as BioStatus['problem']
    return { available: false, type, problem, detail: r.message }
  } catch (e) { return { available: false, type: null, problem: 'error', detail: (e as Error).message } }
}

let inFlight: Promise<boolean> | null = null
/** Una sola richiesta Face ID alla volta: due richieste insieme si annullano a vicenda. */
export function verifyBioOnce() {
  if (!inFlight) inFlight = verifyBio().finally(() => { inFlight = null })
  return inFlight
}
