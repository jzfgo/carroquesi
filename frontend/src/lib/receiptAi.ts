import {
  AIError,
  AIErrorCode,
  FinishReason,
  getGenerativeModel,
  InferenceMode,
  type GenerativeModel,
} from 'firebase/ai'
import type { ParsedLine, ReceiptScanRequest } from '../types'
import { getFirebaseAi } from './firebase'

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

let model: GenerativeModel | undefined

// Built on first scan, not at import: users who never scan a receipt never
// pay for the model, and a bad Firebase config fails inside the scan flow's
// error handling instead of crashing whatever imported this module.
function getModel(): GenerativeModel {
  return (model ??= getGenerativeModel(getFirebaseAi(), {
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
  }))
}

export interface ParseReceiptOptions {
  /**
   * Seed for the retry backoff. Only the tests set it, so the suite does not
   * spend real seconds sleeping between attempts.
   */
  delayMs?: number
}

/**
 * Width to send a receipt photo at. 1000 px was measured to still parse
 * correctly while cutting a 0.5 MB photo to roughly 300 KB.
 *
 * Width, not the longer side: a receipt is portrait, and legibility of the
 * printed lines depends on how many pixels each character gets across. Scaling
 * the long side instead would make a longer receipt — one with more prices on
 * it — narrower and harder to read, which is backwards.
 */
const MAX_RECEIPT_WIDTH = 1000
const RESIZED_MIME_TYPE = 'image/jpeg'
const RESIZE_TIMEOUT_MS = 10_000

function resizeImageFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)

    let resolved = false
    const done = (val: string | null) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(val)
    }

    // A decode that neither loads nor errors would otherwise hold the scan open
    // forever. Falling back to the original file is always available.
    const timer = setTimeout(() => done(null), RESIZE_TIMEOUT_MS)

    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      // A format the browser reports no intrinsic size for, such as an SVG.
      if (!width || !height) {
        done(null)
        return
      }

      const scale = MAX_RECEIPT_WIDTH / width
      // Already narrow enough. Re-encoding here would cost image quality and
      // buy no reduction in the dimensions the model reads.
      if (scale >= 1) {
        done(null)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        done(null)
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      done(canvas.toDataURL(RESIZED_MIME_TYPE, 0.85))
    }
    img.onerror = () => done(null)
    img.src = url
  })
}

async function fileToInlinePart(file: File) {
  if (file.type.startsWith('image/')) {
    const resizedDataUrl = await resizeImageFile(file)
    const base64 = resizedDataUrl?.split(',')[1]
    // An encode the browser declined yields 'data:,' and so no payload. And a
    // re-encode can come out larger than the photo it came from, in which case
    // sending it would defeat the point of resizing at all.
    if (base64 && base64.length <= (file.size * 4) / 3) {
      return { inlineData: { data: base64, mimeType: RESIZED_MIME_TYPE } }
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

const MAX_RETRIES = 2
const INITIAL_RETRY_DELAY_MS = 500

/** Server-side conditions that a later identical request can get past. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

/**
 * Finish reasons worth a second generation. A malformed response is the model
 * garbling its own output, which varies run to run. Every other bad finish
 * reason — SAFETY, PROHIBITED_CONTENT, RECITATION — is a verdict on the input,
 * so asking again just spends two more calls to be told the same thing.
 */
const RETRYABLE_FINISH_REASONS = new Set<string>([
  FinishReason.MALFORMED_RESPONSE,
  FinishReason.MALFORMED_FUNCTION_CALL,
])

/**
 * Decide retryability from the SDK's typed fields, never from the wording of a
 * message. The same rule the push code follows for pruning FCM tokens, and for
 * the same reason: a phrase in an error string is not a contract, so matching on
 * one silently changes meaning the moment Google reformats a message.
 *
 * Anything unrecognised is *not* retried. The case that makes this the right
 * default is the SDK's own 180-second fetch timeout, which surfaces as a plain
 * DOMException rather than an AIError: retrying it would put a user behind a
 * modal for nine minutes.
 */
function isRetryable(error: unknown): boolean {
  // The model returned text that is not JSON, which is what a response cut off
  // at the token limit looks like. Output length varies, so a fresh generation
  // can come back short enough to parse.
  if (error instanceof SyntaxError) return true

  if (!(error instanceof AIError)) return false

  switch (error.code) {
    case AIErrorCode.FETCH_ERROR:
      return RETRYABLE_STATUSES.has(error.customErrorData?.status ?? 0)
    case AIErrorCode.RESPONSE_ERROR: {
      const finishReason =
        error.customErrorData?.response?.candidates?.[0]?.finishReason
      return (
        finishReason !== undefined && RETRYABLE_FINISH_REASONS.has(finishReason)
      )
    }
    // The SDK's catch-all for a call that failed before any response was read.
    // Two things reach it from here, and both are worth another go: the
    // connection dropping, which is Safari's "Load failed", and a token
    // refresh rejecting, because the request headers are built inside the same
    // try. It is broad, so it is the branch to revisit if a deterministic
    // failure ever starts costing three attempts.
    case AIErrorCode.ERROR:
      return true
    default:
      return false
  }
}

async function generateContentWithRetry(
  filePart: { inlineData: { data: string; mimeType: string } },
  options?: ParseReceiptOptions,
) {
  const initialDelay = options?.delayMs ?? INITIAL_RETRY_DELAY_MS
  // Outside the loop and the try: a config error is not a transient parse
  // failure, so it must reject immediately rather than enter the backoff.
  const model = getModel()

  for (let attempt = 0; ; attempt++) {
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
      if (attempt === MAX_RETRIES || !isRetryable(error)) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, initialDelay * 2 ** attempt),
      )
    }
  }
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
