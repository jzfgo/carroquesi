import type { ParsedInput } from '../types'
import { readPackText } from './packText'

const SINGLE_SIGIL_MAP: Record<
  string,
  keyof Omit<ParsedInput, 'name' | 'stores' | 'pack'>
> = {
  '+': 'quantity',
  '#': 'brand',
}

const QUOTED_RE = /([+#@|*]?)(?:"([^"]*)"|'([^']*)')/g
// Null-byte sentinel — cannot appear in user-typed text input.
const PH = String.fromCharCode(0)
const RESTORE_RE = new RegExp(PH + 'q(\\d+)' + PH, 'g')
const SIGILS = '+#@|*'
// `*` opens a format only before something that can start one: a figure,
// «x12», «pack12» or a quoted value. Elsewhere it is text, like a receipt's
// «*PAN BARRA», «*PACK FAMILIAR» or «*packaging».
const PACK_START_RE = new RegExp(`^(?:\\d|[x×]\\d|pack\\d|${PH})`, 'i')

// «x» or «pack» alone opens a format too, when the format goes on in the
// next word: «*x 12», «*pack de 12», «*pack 6 x 33 cl».
function opensPack(value: string, next: string | undefined): boolean {
  if (PACK_START_RE.test(value)) return true
  if (next === undefined) return false
  if (/^[x×]$/i.test(value)) return /^\d/.test(next)
  return /^pack$/i.test(value) && /^(?:\d|de$)/i.test(next)
}
// «pack de 6 x 33 cl» is the longest spelling: the sigil word and five more.
const MAX_PACK_WORDS = 5

export function parseInput(raw: string): ParsedInput {
  // Replace complete quoted sequences with null-byte-delimited placeholders so
  // the word-loop never sees sigil characters that are meant to be literal text.
  // Unclosed quotes produce no regex match and pass through unchanged.
  const placeholders: string[] = []
  // One of dq or sq is always a string when QUOTED_RE matches; typing sq as
  // string reflects the fallback after the dq !== undefined check.
  const withPlaceholders = raw.replace(
    QUOTED_RE,
    (_match, sigil: string, dq: string | undefined, sq: string) => {
      const key = `${PH}q${placeholders.length}${PH}`
      placeholders.push(dq !== undefined ? dq : sq)
      return `${sigil}${key}`
    },
  )
  const restore = (s: string) =>
    s.replace(RESTORE_RE, (_, i: string) => placeholders[+i])

  const words = withPlaceholders.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = {
    name: '',
    quantity: null,
    brand: null,
    stores: [],
  }
  const nameWords: string[] = []

  let currentField:
    keyof Omit<ParsedInput, 'name' | 'stores' | 'pack'> | '@' | null = null
  const tokenWords: Record<string, string[]> = {}
  const storeEntries: string[][] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const sigil = word[0]

    if (sigil === '|') {
      const digits = word.slice(1)
      if (/^\d{8}$|^\d{13}$/.test(digits) && result.ean === undefined) {
        result.ean = digits
      }
    } else if (sigil === '*' && opensPack(word.slice(1), words[i + 1])) {
      // A format may span words («*6 x 1,5 L»). The longest run that reads
      // wins, so no piece of it falls into the name. A sigil ends the run.
      let pack = readPackText(restore(word.slice(1)))
      let taken = 0
      for (
        let k = 1;
        k <= MAX_PACK_WORDS &&
        i + k < words.length &&
        !SIGILS.includes(words[i + k][0]);
        k++
      ) {
        const run = [word.slice(1), ...words.slice(i + 1, i + k + 1)]
        const read = readPackText(restore(run.join(' ')))
        if (read) {
          pack = read
          taken = k
        }
      }
      // The first one wins, read or not, so the preview shows the one sent.
      if (result.pack === undefined) result.pack = pack
      i += taken
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
      ;(result as unknown as Record<string, unknown>)[field] = value
    }
  }

  result.stores = [
    ...new Set(
      storeEntries
        .map((parts) => restore(parts.join(' ')).trim())
        .filter((s) => s.length > 0),
    ),
  ]

  return result
}
