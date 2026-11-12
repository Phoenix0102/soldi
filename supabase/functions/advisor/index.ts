// Consulente AI: analizza il riepilogo finanziario (aggregato, calcolato nell'app) e risponde alle domande.
// La chiave Anthropic resta in private.config (anthropic_key).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MODEL = 'claude-sonnet-5-5'

const BASE = [
  'Sei "Soldi", il consulente di finanza personale dentro l\'app del suo unico utente, che vive in Italia. Dai del tu.',
  'Ricevi un riepilogo JSON dei suoi conti calcolato dall\'app: patrimonio, composizione, entrate e uscite mensili, categorie, abbonamenti, budget, obiettivi, debiti.',
  'Parla in italiano, diretto e concreto, con numeri presi dai dati (euro, formato italiano). Niente frasi generiche: ogni consiglio deve citare una cifra o una categoria dei suoi dati.',
  'Contesto italiano quando serve: fondo emergenza su conto deposito, PAC su ETF azionari globali ad accumulazione, fondo pensione con deducibilità fino a 5.300 €, bollo titoli 0,2%, tassazione 26% (12,5% titoli di Stato), detrazioni 730 al 19%.',
  'Non suggerire titoli o prodotti specifici di un emittente; puoi indicare categorie di strumenti. Se i dati sono incompleti (molti movimenti senza categoria, conti senza saldo) dillo e tienine conto.',
].join('\n')

async function claude(apiKey: string, system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens: number) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Errore API ${res.status}`)
  return (body.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u.user) return json({ error: 'Non autorizzato' }, 401)
  const { data: owner } = await admin.from('app_owner').select('user_id').eq('user_id', u.user.id).maybeSingle()
  if (!owner) return json({ error: 'Non autorizzato' }, 403)

  const key = (await admin.rpc('get_config', { k: 'anthropic_key' })).data as string | null
  if (!key) return json({ error: 'Attiva l\'AI in Impostazioni › Collegamenti' }, 400)

  const body = await req.json().catch(() => ({}))
  const summary = JSON.stringify(body.summary ?? {})
  try {
    if (body.action === 'analyze') {
      const system = `${BASE}

Restituisci SOLO un oggetto JSON con questa forma, senza testo prima o dopo:
{
  "score": numero 0-100 (salute finanziaria complessiva: fondo emergenza, tasso di risparmio, debiti, diversificazione, controllo delle spese),
  "headline": "una frase che riassume la situazione",
  "scores": { "risparmio": 0-100, "emergenza": 0-100, "debiti": 0-100, "investimenti": 0-100, "spese": 0-100 },
  "strengths": ["2-3 punti forti con numeri"],
  "risks": ["2-3 rischi o problemi con numeri"],
  "actions": [ { "title": "azione breve", "detail": "come farla, 1-2 frasi con cifre", "impact": "alto|medio|basso", "monthly": numero di euro al mese liberati o da mettere da parte, oppure null } ] (4-6 azioni in ordine di priorità),
  "plan": { "emergenza": euro consigliati per il fondo emergenza, "risparmioMensile": euro al mese da risparmiare, "investimentoMensile": euro al mese da investire quando il fondo è pieno },
  "outlook": "proiezione a 12 mesi se segue il piano, una frase con cifre"
}`
      const text = await claude(key, system, [{ role: 'user', content: `Dati:\n${summary}` }], 2500)
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Risposta non valida, riprova')
      return json({ analysis: JSON.parse(m[0]), at: new Date().toISOString() })
    }

    if (body.action === 'chat') {
      const history = (body.messages as { role: 'user' | 'assistant'; content: string }[] ?? []).slice(-12)
        .filter((x) => (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
      if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'Messaggio mancante' }, 400)
      const system = `${BASE}

Rispondi alle domande sui suoi soldi usando i dati qui sotto. Risposte brevi (massimo 150 parole salvo richiesta), con **grassetto** per le cifre chiave ed elenchi puntati con "- " quando servono. Se una domanda richiede dati che non hai, dillo e suggerisci dove guardarli nell'app.

Dati aggiornati:
${summary}`
      const reply = await claude(key, system, history, 1200)
      return json({ reply })
    }
    return json({ error: 'Azione sconosciuta' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
