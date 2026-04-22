import type { ParsedInput } from './types'

const SINGLE_SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name' | 'stores'>> = {
  '+': 'quantity',
  '#': 'brand',
}

const PRICE_SIGILS = new Set(['$', '€'])
const PRICE_RE = /^(\d+([,.]\d{1,2})?|[,.]\d{1,2})(\/kg)?$/i

export function parseInput(raw: string): ParsedInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)

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

  result.name = nameWords.join(' ')

  for (const [field, parts] of Object.entries(tokenWords)) {
    if (parts.length > 0 && parts.join('').length > 0) {
      (result as unknown as Record<string, unknown>)[field] = parts.join(' ')
    }
  }

  result.stores = [...new Set(
    storeEntries
      .map(parts => parts.join(' ').trim())
      .filter(s => s.length > 0)
  )]

  return result
}
