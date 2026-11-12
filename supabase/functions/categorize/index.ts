// Suggerimenti di categoria con Claude per gli esercenti che nessuna regola riconosce.
// La chiave API resta in private.config (anthropic_key) e non arriva mai al browser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MODEL = 'claude-haiku-5-5'

type Item = { key: string; samples: string[]; sign: 'in' | 'out'; count: number; total: number }
type Cat = { id: string; name: string; kind: 'income' | 'expense' }

async function claude(apiKey: string, system: string, user: string, maxTokens = 4000, extra: Record<string, unknown> = {}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], ...extra }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Errore API ${res.status}`)
  return body as { content: { type: string; text?: string; input?: { risposte?: { chiave: string; categoria: string | null }[] } }[] }
}

// Risposta strutturata tramite strumento obbligatorio: sempre un JSON valido
const TOOL = {
  name: 'categorie',
  description: 'Categoria scelta per ogni gruppo di movimenti.',
  input_schema: {
    type: 'object', required: ['risposte'],
    properties: { risposte: { type: 'array', items: { type: 'object', required: ['chiave', 'categoria'], properties: {
      chiave: { type: 'string', description: 'La chiave del gruppo, identica a quella ricevuta' },
      categoria: { type: ['string', 'null'], description: 'Id della categoria, "transfer" per i giroconti, null se incerto' },
    } } } },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const cfg = async (k: string) => (await admin.rpc('get_config', { k })).data as string | null

  // Solo il proprietario dell'app
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: u } = await admin.auth.getUser(jwt)
  if (!u.user) return json({ error: 'Non autorizzato' }, 401)
  const { data: owner } = await admin.from('app_owner').select('user_id').eq('user_id', u.user.id).maybeSingle()
  if (!owner) return json({ error: 'Non autorizzato' }, 403)

  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  try {
    if (action === 'status') return json({ configured: !!(await cfg('anthropic_key')) })

    if (action === 'configure') {
      const key = String(body.key ?? '').trim()
      if (!/^sk-ant-[\w-]{20,}$/.test(key)) return json({ error: 'La chiave inizia con sk-ant- (la trovi su console.anthropic.com)' }, 400)
      await claude(key, 'Rispondi solo "ok".', 'ok', 5)
      await admin.rpc('set_config_value', { k: 'anthropic_key', v: key })
      return json({ ok: true })
    }

    if (action === 'forget') {
      await admin.rpc('delete_config_value', { k: 'anthropic_key' })
      return json({ ok: true })
    }

    if (action === 'suggest') {
      const key = await cfg('anthropic_key')
      if (!key) return json({ error: 'Categorizzazione automatica non configurata' }, 400)
      const items = (body.items as Item[] ?? []).slice(0, 80)
      const cats = (body.categories as Cat[] ?? []).filter((c) => c.id && c.name)
      if (!items.length || !cats.length) return json({ suggestions: {} })

      const catList = cats.map((c) => `${c.id} | ${c.kind === 'income' ? 'entrata' : 'uscita'} | ${c.name}`).join('\n')
      const itemList = items.map((i, n) => `${n + 1}. chiave="${i.key}" segno=${i.sign === 'in' ? 'entrata' : 'uscita'} volte=${i.count} totale=${Math.abs(i.total).toFixed(2)}€ esempi: ${i.samples.slice(0, 3).map((s) => JSON.stringify(s)).join(', ')}`).join('\n')
      const system = [
        'Sei un assistente che categorizza movimenti bancari di una persona in Italia (estratti conto ING e Revolut).',
        'Per ogni gruppo scegli l\'id di UNA categoria dall\'elenco, rispettando il segno: le uscite vanno su categorie "uscita", le entrate su categorie "entrata".',
        'Usa "transfer" se il movimento è chiaramente un trasferimento tra conti della stessa persona (es. bonifico a sé stesso, ricarica di un proprio conto o carta, "To <nome>" uguale al titolare, cambio valuta).',
        'Usa null se non sei ragionevolmente sicuro: è meglio lasciare un gruppo da smistare a mano che sbagliare.',
        'Rispondi compilando lo strumento "categorie" con una voce per ogni gruppo.',
      ].join('\n')
      const user = `Categorie (id | tipo | nome):\n${catList}\n\nGruppi da categorizzare:\n${itemList}`
      const r = await claude(key, system, user, 8000, { tools: [TOOL], tool_choice: { type: 'tool', name: 'categorie' } })
      const list = r.content.find((c) => c.type === 'tool_use')?.input?.risposte ?? []
      const raw: Record<string, string | null> = Object.fromEntries(list.map((x) => [x.chiave, x.categoria]))
      const valid = new Map(cats.map((c) => [c.id, c]))
      const out: Record<string, string> = {}
      for (const i of items) {
        const v = raw[i.key]
        if (v === 'transfer') out[i.key] = 'transfer'
        else if (v && valid.has(v)) {
          const c = valid.get(v)!
          if ((c.kind === 'income') === (i.sign === 'in')) out[i.key] = v
        }
      }
      return json({ suggestions: out })
    }

    return json({ error: 'Azione sconosciuta' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
