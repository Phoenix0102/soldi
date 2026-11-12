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

async function call(apiKey: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, ...payload }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Errore API ${res.status}`)
  return body as { content: { type: string; text?: string; input?: unknown }[]; stop_reason: string }
}

async function claude(apiKey: string, system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens: number) {
  const body = await call(apiKey, { max_tokens: maxTokens, system, messages })
  return body.content.map((c) => c.text ?? '').join('')
}

// Schema del rapporto: lo strumento obbligatorio garantisce un JSON sempre valido
const n = (d: string) => ({ type: 'number', description: d })
const REPORT = {
  name: 'rapporto',
  description: 'Rapporto sulla salute finanziaria con piano d\'azione.',
  input_schema: {
    type: 'object',
    required: ['score', 'headline', 'scores', 'strengths', 'risks', 'actions', 'plan', 'outlook'],
    properties: {
      score: n('Salute finanziaria complessiva 0-100'),
      headline: { type: 'string', description: 'Una frase che riassume la situazione' },
      scores: { type: 'object', required: ['risparmio', 'emergenza', 'debiti', 'investimenti', 'spese'], properties: {
        risparmio: n('0-100'), emergenza: n('0-100'), debiti: n('0-100'), investimenti: n('0-100'), spese: n('0-100'),
      } },
      strengths: { type: 'array', items: { type: 'string' }, description: '2-3 punti forti con numeri, frasi brevi' },
      risks: { type: 'array', items: { type: 'string' }, description: '2-3 rischi con numeri, frasi brevi' },
      actions: { type: 'array', description: '4-6 azioni in ordine di priorità', items: { type: 'object', required: ['title', 'detail', 'impact'], properties: {
        title: { type: 'string' }, detail: { type: 'string', description: '1-2 frasi con cifre' },
        impact: { type: 'string', enum: ['alto', 'medio', 'basso'] }, monthly: { type: ['number', 'null'], description: 'Euro al mese liberati o da accantonare' },
      } } },
      plan: { type: 'object', required: ['emergenza', 'risparmioMensile', 'investimentoMensile'], properties: {
        emergenza: n('Euro consigliati per il fondo emergenza'), risparmioMensile: n('Euro al mese da risparmiare'), investimentoMensile: n('Euro al mese da investire quando il fondo è pieno'),
      } },
      outlook: { type: 'string', description: 'Proiezione a 12 mesi se segue il piano, una frase con cifre' },
    },
  },
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
      // Se la risposta si interrompe (troppo lunga) riprovo una volta chiedendo frasi più corte
      const ask = (extra: string, max: number) => call(key, {
        max_tokens: max, system: `${BASE}\n\nAnalizza i dati e compila il rapporto con lo strumento "rapporto". Frasi brevi e concrete.${extra}`,
        tools: [REPORT], tool_choice: { type: 'tool', name: 'rapporto' },
        messages: [{ role: 'user', content: `Dati:\n${summary}` }],
      })
      const pick = (r: Awaited<ReturnType<typeof call>>) => {
        const a = r.content.find((c) => c.type === 'tool_use')?.input as Record<string, unknown> | undefined
        return r.stop_reason !== 'max_tokens' && a && Number.isFinite(Number(a.score)) && Array.isArray(a.actions) ? a : null
      }
      let analysis = pick(await ask('', 6000))
      if (!analysis) analysis = pick(await ask(' Massimo 4 azioni e 2 punti per elenco, ogni frase sotto le 25 parole.', 6000))
      if (!analysis) throw new Error('Analisi non riuscita, riprova tra poco')
      return json({ analysis, at: new Date().toISOString() })
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
