import type { ContentUnit, PackFormat } from './itemCost'

/*
 * Reads the value of the input bar's `*` sigil: «6x1,5L», «108g», «12».
 *
 * The size grammar is the backend's (`format_in_quantity`). Both sides are
 * pinned to packTextVectors.json — change one only through that file. A count
 * alone («12», «12 uds», «x12», «pack de 12») is read with the name's count
 * spellings, plus the bare number: in a name or a quantity, «12» says nothing
 * about the pack, but after `*` it can only be a count.
 */

const NUM = String.raw`(\d+(?:[.,]\d+)?)`
const UNIT = 'kgs?|kilos?|grs?|gramos?|g|ml|cl|dl|lts?|litros?|l'

const COUNT_AND_CONTENT = new RegExp(
  String.raw`^(?:pack\s*(?:de\s*)?)?(\d+)\s*[x×]\s*${NUM}\s*(${UNIT})\.?$`,
  'i',
)
const CONTENT = new RegExp(String.raw`^${NUM}\s*(${UNIT})\.?$`, 'i')
// «12», «12 uds», «x12», «pack de 12»: the count spellings a name reads.
const COUNT =
  /^(?:pack\s*(?:de\s*)?(\d+)|(\d+)\s*(?:uds?|unidades)\.?|x\s*(\d+)|(\d+))$/i

const UNITS: Record<string, ContentUnit> = {
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  g: 'g',
  gr: 'g',
  grs: 'g',
  gramo: 'g',
  gramos: 'g',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  lt: 'l',
  lts: 'l',
  litro: 'l',
  litros: 'l',
}

// «1.000» is a thousand in Spanish: refused rather than read as one.
const THOUSANDS = /^[1-9]\d{0,2}\.\d{3}$/

// The bounds the API holds a format to.
const MAX_COUNT = 1000
const MIN_CONTENT = 0.001
const MAX_CONTENT = 100_000

function pack(
  count: number,
  content: string | null,
  unit: string | null,
): PackFormat | null {
  if (count < 1 || count > MAX_COUNT) return null
  if (content == null || unit == null) {
    return count > 1 ? { count, content: null, unit: null } : null
  }
  if (THOUSANDS.test(content)) return null
  const figure = parseFloat(content.replace(',', '.'))
  if (figure < MIN_CONTENT || figure > MAX_CONTENT) return null
  return { count, content: figure, unit: UNITS[unit.toLowerCase()] }
}

/** The format a sigil value names, or null when it names none. */
export function readPackText(text: string): PackFormat | null {
  const trimmed = text.trim()
  let m = trimmed.match(COUNT_AND_CONTENT)
  if (m) return pack(Number(m[1]), m[2], m[3])
  m = trimmed.match(CONTENT)
  if (m) return pack(1, m[1], m[2])
  m = trimmed.match(COUNT)
  if (m) return pack(Number(m.slice(1).find(Boolean)), null, null)
  return null
}
