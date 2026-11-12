// Ogni Mac di GitHub è nuovo: il certificato di sviluppo creato dalla build precedente
// esiste su Apple ma la sua chiave privata è sparita con quel Mac. Lo revoco, così Xcode
// ne crea uno nuovo. Tocca solo i certificati di sviluppo creati via API (mai quelli di distribuzione).
import crypto from 'node:crypto'
import fs from 'node:fs'

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env
const key = fs.readFileSync(ASC_KEY_PATH, 'utf8')
const b64u = (s) => Buffer.from(s).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const head = `${b64u(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }))}`
const sig = crypto.sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' })
const auth = { Authorization: `Bearer ${head}.${b64u(sig)}` }
const api = 'https://api.appstoreconnect.apple.com/v1'

const res = await fetch(`${api}/certificates?filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&limit=200`, { headers: auth })
if (!res.ok) { console.log(`Elenco certificati non disponibile (${res.status}): proseguo`); process.exit(0) }
const { data = [] } = await res.json()
let n = 0
for (const c of data) {
  const name = `${c.attributes?.name ?? ''} ${c.attributes?.displayName ?? ''}`
  if (!/created via api/i.test(name)) continue
  const d = await fetch(`${api}/certificates/${c.id}`, { method: 'DELETE', headers: auth })
  console.log(`${d.ok ? 'Revocato' : 'Non revocato'}: ${name.trim()} (${d.status})`)
  if (d.ok) n++
}
console.log(`Certificati di sviluppo revocati: ${n}`)
