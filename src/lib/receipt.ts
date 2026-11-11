import { parseAmount } from './format'

export interface ReceiptResult { amount: number | null; date: string | null; merchant: string | null; text: string }

/** Legge uno scontrino con OCR nel browser (nessun dato esce verso servizi AI). */
export async function readReceipt(file: File, onProgress?: (p: number) => void): Promise<ReceiptResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('ita', 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress) },
  })
  const { data } = await worker.recognize(file)
  await worker.terminate()
  return parseReceipt(data.text)
}

export function parseReceipt(text: string): ReceiptResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const amountRe = /(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})\b/g

  let amount: number | null = null
  const totalLines = lines.filter((l) => /(totale|total|importo pagato|pagato|tot\.?\s*eur|da pagare|contante|pagamento elettronico)/i.test(l) && !/(sub|parziale|iva|imponibile|resto)/i.test(l))
  const fromTotals = totalLines.flatMap((l) => [...l.matchAll(amountRe)].map((m) => parseAmount(m[1]) ?? 0))
  if (fromTotals.length) amount = Math.max(...fromTotals)
  else {
    const all = lines.flatMap((l) => [...l.matchAll(amountRe)].map((m) => parseAmount(m[1]) ?? 0)).filter((n) => n < 5000)
    if (all.length) amount = Math.max(...all)
  }

  let date: string | null = null
  const dm = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/)
  if (dm) {
    const d = dm[1].padStart(2, '0'), m = dm[2].padStart(2, '0')
    const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3]
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) date = `${y}-${m}-${d}`
  }

  const merchant = lines.find((l) => /[a-zA-Z]{3,}/.test(l) && !/(documento|commerciale|scontrino|fiscale|p\.?\s?iva|via |tel)/i.test(l))
    ?.replace(/[^a-zA-Z0-9àèéìòù&'. -]/g, '').trim().slice(0, 40) ?? null

  return { amount, date, merchant, text }
}
