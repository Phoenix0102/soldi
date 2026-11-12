/* Sblocco con Face ID / impronta.
   Nel browser tramite WebAuthn, nell'app iOS con Face ID nativo.
   È un blocco locale come il PIN: la credenziale resta nel portachiavi del dispositivo. */
import { isNative } from './native'

const KEY = 'soldi-bio'
const NATIVE = 'native'

const nativeBio = async () => (await import('@capgo/capacitor-native-biometric')).NativeBiometric

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export const bioEnabled = () => !!localStorage.getItem(KEY)

export async function bioAvailable() {
  try {
    if (isNative()) return (await (await nativeBio()).isAvailable({ useFallback: false })).isAvailable
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch { return false }
}

export async function enableBio() {
  if (isNative()) {
    await (await nativeBio()).verifyIdentity({ reason: 'Attiva lo sblocco di Soldi con Face ID', useFallback: false })
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

export const disableBio = () => localStorage.removeItem(KEY)

export async function verifyBio() {
  const id = localStorage.getItem(KEY)
  if (!id) return false
  if (isNative()) {
    try {
      await (await nativeBio()).verifyIdentity({ reason: 'Sblocca Soldi', useFallback: false })
      return true
    } catch { return false }
  }
  if (id === NATIVE) return false
  try {
    const res = await navigator.credentials.get({
      publicKey: { challenge: random(32), allowCredentials: [{ type: 'public-key', id: fromB64(id) }], userVerification: 'required', timeout: 60000, rpId: location.hostname },
    })
    return !!res
  } catch { return false }
}
