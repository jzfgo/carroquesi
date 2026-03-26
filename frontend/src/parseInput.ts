import type { ParsedInput } from './types'

const SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name'>> = {
  '+': 'quantity',
  '*': 'variety',
  '#': 'brand',
  '@': 'store',
}

export function parseInput(raw: string): ParsedInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = { name: '', quantity: null, variety: null, brand: null, store: null }
  const nameWords: string[] = []
  let currentField: keyof Omit<ParsedInput, 'name'> | null = null
  const tokenWords: Record<string, string[]> = {}

  for (const word of words) {
    const sigil = word[0]
    const field = SIGIL_MAP[sigil]

    if (field) {
      currentField = field
      tokenWords[field] = [word.slice(1)]   // strip sigil; reset (last occurrence wins)
    } else if (currentField) {
      tokenWords[currentField].push(word)
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

  return result
}
