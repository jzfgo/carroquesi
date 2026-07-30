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
- receipt_date: purchase date as YYYY-MM-DD. Return null if not clearly readable. A receipt is printed at the moment of purchase, so its date is never in the future — if the digits you read would produce a future date you have misread them, so return null rather than a guess.
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

export interface ParseReceiptOptions {
  maxRetries?: number
  delayMs?: number
}

function resizeImageFile(
  file: File,
  maxDimension: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (
      typeof window === 'undefined' ||
      typeof HTMLCanvasElement === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      resolve(null)
      return
    }

    let url: string
    try {
      url = URL.createObjectURL(file)
    } catch {
      resolve(null)
      return
    }

    let resolved = false
    const done = (val: string | null) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* ignore */
      }
      resolve(val)
    }

    const timer = setTimeout(() => done(null), 10000)

    try {
      const img = new Image()
      img.onload = () => {
        try {
          let { width, height } = img
          if (!width || !height) {
            done(null)
            return
          }

          const scale = Math.min(1, maxDimension / Math.max(width, height))
          width = Math.round(width * scale)
          height = Math.round(height * scale)

          if (scale === 1 && file.size < 1024 * 1024) {
            done(null)
            return
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            done(null)
            return
          }
          ctx.drawImage(img, 0, 0, width, height)
          done(canvas.toDataURL('image/jpeg', 0.85))
        } catch {
          done(null)
        }
      }
      img.onerror = () => done(null)
      img.src = url
    } catch {
      done(null)
    }
  })
}

async function fileToInlinePart(file: File) {
  if (file.type.startsWith('image/')) {
    try {
      const resizedDataUrl = await resizeImageFile(file, 1600)
      if (resizedDataUrl) {
        const [header, base64] = resizedDataUrl.split(',')
        if (base64.length <= (file.size * 4) / 3) {
          const mimeType = header.match(/:(.*?);/)?.[1] || file.type
          return { inlineData: { data: base64, mimeType } }
        }
      }
    } catch {
      // Ignore resizing errors and fall back to original file
    }
  }

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

async function generateContentWithRetry(
  filePart: { inlineData: { data: string; mimeType: string } },
  options?: ParseReceiptOptions,
) {
  const maxRetries = options?.maxRetries ?? 2
  const initialDelay = options?.delayMs ?? 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent([filePart, PROMPT])
      const text = result.response.text()
      return JSON.parse(text) as {
        store?: string | null
        receipt_date?: string | null
        receipt_time?: string | null
        receipt_total?: number | null
        lines: ParsedLine[]
      }
    } catch (error: unknown) {
      const err = error as {
        message?: string
        customErrorData?: { status?: number }
      }

      const fromMessage = err?.message?.match(/\[(\d{3})\s/)?.[1]
      const status =
        err?.customErrorData?.status ??
        (fromMessage ? Number(fromMessage) : undefined)
      const is4xx = typeof status === 'number' && status >= 400 && status < 500

      let isTransient = false
      if (error instanceof SyntaxError) {
        isTransient = true
      } else if (
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) {
        isTransient = true
      } else if (
        err?.message &&
        err.message.match(/\b(429|500|502|503|504)\b/)
      ) {
        isTransient = true
      } else if (err?.message && err.message.includes('blocked') && !is4xx) {
        isTransient = true
      } else if (
        err?.message?.match(/fetch|network|load failed|connection was lost/i) &&
        !is4xx
      ) {
        isTransient = true
      }

      if (!isTransient || attempt >= maxRetries) {
        throw error
      }

      const delay = initialDelay * Math.pow(2, attempt)
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  // Fallback (should be unreachable given the throw inside the loop)
  throw new Error('Retries exhausted')
}

export async function parseReceiptWithAi(
  file: File,
  options?: ParseReceiptOptions,
): Promise<ReceiptScanRequest> {
  const filePart = await fileToInlinePart(file)
  const raw = await generateContentWithRetry(filePart, options)
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
