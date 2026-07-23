import { getGenerativeModel, InferenceMode } from 'firebase/ai'
import type { ParsedLine, ReceiptScanRequest } from '../types'
import { ai } from './firebase'

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string', nullable: true },
    receipt_date: { type: 'string', nullable: true },
    receipt_time: { type: 'string', nullable: true },
    receipt_total: { type: 'number', nullable: true },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price_type: { type: 'string', enum: ['UNIT', 'KILOGRAM', 'MULTI'] },
          unit_price: { type: 'number' },
          quantity: { type: 'number', nullable: true },
          line_total: { type: 'number' },
        },
        required: ['name', 'price_type', 'unit_price', 'line_total'],
      },
    },
  },
  required: ['lines'],
}

const PROMPT = `Extract structured data from this Spanish grocery receipt.

RULES:
- store: the supermarket name (e.g. "Mercadona", "Carrefour"). Return null if not clearly visible. Do not infer from product names.
- receipt_date: purchase date as YYYY-MM-DD. Return null if not clearly readable.
- receipt_time: purchase time as HH:MM in 24-hour form, exactly as printed on the receipt. Return null if not clearly readable. Do not infer or guess.
- receipt_total: final total charged. Return null if not clearly readable.
- lines: purchased product lines only. Omit any line where name or price is not clearly legible.
- Skip: subtotals, taxes, VAT, loyalty discounts, cashier info, store address, payment lines.
- price_type:
  - "UNIT": single item at fixed price. unit_price = shown price. line_total = unit_price.
  - "KILOGRAM": sold by weight. unit_price = price per kg. quantity = weight in kg. line_total = unit_price x quantity.
  - "MULTI": multiple units at combined price. unit_price = line_total divided by quantity. quantity = number of units.
- Normalise product names to Spanish title case.
- CRITICAL: If any value is unclear, partially obscured, or you are not fully confident, return null or omit the line. Do not guess. Accuracy over completeness.`

const model = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_IN_CLOUD,
  onDeviceParams: {
    createOptions: {
      expectedInputs: [{ type: 'image' }],
      expectedOutputs: [{ type: 'text', languages: ['es'] }],
    },
    promptOptions: {
      responseConstraint: RECEIPT_SCHEMA,
    },
  },
  inCloudParams: {
    model: 'gemini-3.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: RECEIPT_SCHEMA,
    },
  },
})

async function fileToInlinePart(file: File) {
  return new Promise<{ inlineData: { data: string; mimeType: string } }>(
    (resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        resolve({
          inlineData: { data: result.split(',')[1], mimeType: file.type },
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    },
  )
}

/**
 * Combine the receipt's printed date and time — which are LOCAL wall-clock — into
 * a UTC instant.
 *
 * `purchased_at` is stored naive-UTC and rendered by appending 'Z', so sending
 * local time unconverted would shift an evening receipt onto the following day.
 * Using the Date constructor (rather than string concatenation) applies the
 * browser's offset rules for that specific date, which keeps receipts from the
 * other side of a DST change correct.
 */
export function toReceiptInstant(
  date: string | null,
  time: string | null,
): string | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)

  // Deliberately asymmetric with the date validation below: a malformed time
  // silently degrades to 0 (midnight) — the same value as "no time was
  // extracted" — because losing intraday ordering is cosmetic and same-day.
  // A malformed date is rejected outright below, because a garbled date could
  // point anywhere and there's no safe fallback to degrade to.
  let hours = 0
  let minutes = 0
  if (time) {
    const [h, min] = time.split(':').map(Number)
    if (Number.isInteger(h) && h >= 0 && h <= 23) hours = h
    if (Number.isInteger(min) && min >= 0 && min <= 59) minutes = min
  }

  const dt = new Date(y, m - 1, d, hours, minutes, 0, 0)
  // JS Date normalises out-of-range and NaN/zero components instead of
  // rejecting them ('2026-01-32' becomes Feb 1; `new Date(0, ...)` maps to
  // 1900; a NaN component yields an Invalid Date), and toISOString() throws
  // on an extreme year. Round-tripping the components catches all of these:
  // a rolled or coerced value no longer matches what we fed in, and an
  // invalid date fails the NaN check first.
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null
  }
  return dt.toISOString()
}

export async function parseReceiptWithAi(
  file: File,
): Promise<ReceiptScanRequest> {
  const filePart = await fileToInlinePart(file)
  const result = await model.generateContent([filePart, PROMPT])
  const text = result.response.text()
  const raw = JSON.parse(text) as {
    store?: string | null
    receipt_date?: string | null
    receipt_time?: string | null
    receipt_total?: number | null
    lines: ParsedLine[]
  }
  return {
    store: raw.store ?? null,
    receipt_date: toReceiptInstant(
      raw.receipt_date ?? null,
      raw.receipt_time ?? null,
    ),
    receipt_total: raw.receipt_total ?? null,
    lines: raw.lines,
  }
}
