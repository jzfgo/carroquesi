import type { ParsedInput } from './types'

const SINGLE_SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name' | 'stores'>> = {
  '+': 'quantity',
  '*': 'variety',
  '#': 'brand',
}

export function parseInput(raw: string): ParsedInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = { name: '', quantity: null, variety: null, brand: null, stores: [] }
  const nameWords: string[] = []

  let currentField: keyof Omit<ParsedInput, 'name' | 'stores'> | '@' | null = null
  const tokenWords: Record<string, string[]> = {}
  const storeEntries: string[][] = []

  for (const word of words) {
    const sigil = word[0]

    if (sigil === '@') {
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

  result.stores = storeEntries
    .map(parts => parts.join(' ').trim())
    .filter(s => s.length > 0)

  return result
}
