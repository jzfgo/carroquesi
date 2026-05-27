import { getGenerativeModel, InferenceMode } from 'firebase/ai'
import type { ParsedLine, ReceiptScanRequest } from '../types/receipt'
import { ai } from './firebase'

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: 'string', nullable: true },
    receipt_date: { type: 'string', nullable: true },
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
- receipt_total: final total charged. Return null if not clearly readable.
- lines: purchased product lines only. Omit any line where name or price is not clearly legible.
- Skip: subtotals, taxes, VAT, loyalty discounts, bag charges, cashier info, store address, payment lines.
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
      // @ts-expect-error - expectedOutputs not yet in Firebase SDK types
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

export async function parseReceiptWithAi(
  file: File,
): Promise<ReceiptScanRequest> {
  const filePart = await fileToInlinePart(file)
  const result = await model.generateContent([filePart, PROMPT])
  const text = result.response.text()
  const raw = JSON.parse(text) as {
    store?: string | null
    receipt_date?: string | null
    receipt_total?: number | null
    lines: ParsedLine[]
  }
  return {
    store: raw.store ?? null,
    receipt_date: raw.receipt_date ?? null,
    receipt_total: raw.receipt_total ?? null,
    lines: raw.lines,
  }
}
