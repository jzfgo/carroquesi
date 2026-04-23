import type { ParsedInput } from './types'

const SINGLE_SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name' | 'stores'>> = {
  '+': 'quantity',
  '#': 'brand',
}

const PRICE_SIGILS = new Set(['$', '€'])
const PRICE_RE = /^(\d+([,.]\d{1,2})?|[,.]\d{1,2})(\/kg)?$/i
const QUOTED_RE = /([+#@$€|]?)(?:"([^"]*)"|'([^']*)')/g
// Null-byte sentinel — cannot appear in user-typed text input.
const PH = String.fromCharCode(0)
const RESTORE_RE = new RegExp(PH + 'q(\\d+)' + PH, 'g')

export function parseInput(raw: string): ParsedInput {
  // Replace complete quoted sequences with null-byte-delimited placeholders so
  // the word-loop never sees sigil characters that are meant to be literal text.
  // Unclosed quotes produce no regex match and pass through unchanged.
  const placeholders: string[] = []
  const withPlaceholders = raw.replace(QUOTED_RE, (_match, sigil, dq, sq) => {
    const key = `${PH}q${placeholders.length}${PH}`
    placeholders.push(dq !== undefined ? dq : sq)
    return `${sigil}${key}`
  })
  const restore = (s: string) =>
    s.replace(RESTORE_RE, (_, i) => placeholders[+i])

  const words = withPlaceholders.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = { name: '', quantity: null, brand: null, stores: [] }
  const nameWords: string[] = []

  let currentField: keyof Omit<ParsedInput, 'name' | 'stores'> | '@' | null = null
  const tokenWords: Record<string, string[]> = {}
  const storeEntries: string[][] = []

  for (const word of words) {
    const sigil = word[0]

    if (sigil === '|') {
      const digits = word.slice(1)
      if (/^\d{8}$|^\d{13}$/.test(digits) && result.ean === undefined) {
        result.ean = digits
      }
    } else if (PRICE_SIGILS.has(sigil)) {
      if (result.price === undefined) {
        const rest = word.slice(1)
        const match = rest.match(PRICE_RE)
        if (match) {
          const normalized = match[1].replace(/[,.]/, '.')
          result.price = parseFloat(normalized)
          result.pricePer = match[3] ? 'KILOGRAM' : null
        }
      }
      // Price is single-token: do not update currentField
    } else if (sigil === '@') {
      storeEntries.push([word.slice(1)])
      currentField = '@'
    } else if (sigil in SINGLE_SIGIL_MAP) {
      const field = SINGLE_SIGIL_MAP[sigil]
      if (!(field in tokenWords)) {
        tokenWords[field] = [word.slice(1)]
      }
      currentField = field
    } else if (currentField === '@') {
      storeEntries[storeEntries.length - 1].push(word)
    } else if (currentField) {
      tokenWords[currentField as string].push(word)
    } else {
      nameWords.push(word)
    }
  }

  result.name = restore(nameWords.join(' '))

  for (const [field, parts] of Object.entries(tokenWords)) {
    const value = restore(parts.join(' ')).trim()
    if (value.length > 0) {
      (result as unknown as Record<string, unknown>)[field] = value
    }
  }

  result.stores = [...new Set(
    storeEntries
      .map(parts => restore(parts.join(' ')).trim())
      .filter(s => s.length > 0)
  )]

  return result
}
