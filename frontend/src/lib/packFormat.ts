import { type ContentUnit, type PackFormat, readUnit } from './itemCost'

const FIGURE = new Intl.NumberFormat('es-ES', {
  useGrouping: false,
  maximumFractionDigits: 3,
})

// The litre is always «L», so it never reads as a one.
const UNIT_TEXT: Record<ContentUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'L',
}

function unitText(unit: ContentUnit, caps: boolean): string {
  return caps ? UNIT_TEXT[unit].toUpperCase() : UNIT_TEXT[unit]
}

/** The content of one unit of the pack, «1,5 L» or «108 g». */
export function formatContent(
  content: number,
  unit: ContentUnit,
  caps = false,
): string {
  return `${FIGURE.format(content)} ${unitText(unit, caps)}`
}

/**
 * A pack format as a shelf label prints it: «6 × 1,5 L», «108 g», «pack de
 * 12». `caps` is the mono voice of bought rows: «108 G», «PACK DE 12».
 */
export function formatPack(pack: PackFormat, caps = false): string {
  if (pack.content == null || pack.unit == null) {
    return caps ? `PACK DE ${pack.count}` : `pack de ${pack.count}`
  }
  const content = formatContent(pack.content, pack.unit, caps)
  return pack.count > 1 ? `${pack.count} × ${content}` : content
}

/** What the «Peso» field holds: nothing, a weight, or a figure with no unit. */
export type PackWeight =
  | { kind: 'empty' }
  | { kind: 'weight'; content: number; unit: ContentUnit }
  | { kind: 'invalid' }

// The same bounds the API holds a pack's content to.
const MIN_CONTENT = 0.001
const MAX_CONTENT = 100_000

/**
 * Reads the «Peso» field as typed: «1,5 L», «108 gramos», «33cl». The unit
 * is required: a bare figure could be grams or litres, so it is refused.
 */
export function readPackWeight(text: string): PackWeight {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'empty' }
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(\p{L}+\.?)$/u)
  if (!m) return { kind: 'invalid' }
  const content = parseFloat(m[1].replace(',', '.'))
  const unit = readUnit(m[2])
  if (unit == null || content < MIN_CONTENT || content > MAX_CONTENT) {
    return { kind: 'invalid' }
  }
  return { kind: 'weight', content, unit }
}

/** The «Unidades» field: a whole number from 1 to 1000; empty means 1. */
export function readPackCount(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return 1
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n >= 1 && n <= 1000 ? n : null
}

/**
 * The format the two fields give, null when they say nothing (which removes
 * a format), or undefined when one of them cannot be read.
 */
export function packFromFields(
  countText: string,
  weightText: string,
): PackFormat | null | undefined {
  const count = readPackCount(countText)
  const weight = readPackWeight(weightText)
  if (count == null || weight.kind === 'invalid') return undefined
  if (weight.kind === 'empty') {
    return count === 1 ? null : { count, content: null, unit: null }
  }
  return { count, content: weight.content, unit: weight.unit }
}

/** The text that seeds the «Peso» field from a stored format. */
export function packWeightText(pack: PackFormat | null): string {
  if (pack?.content == null || pack.unit == null) return ''
  return formatContent(pack.content, pack.unit)
}

/** Whether two formats say the same thing. */
export function samePack(a: PackFormat | null, b: PackFormat | null): boolean {
  if (a == null || b == null) return a == b
  return (
    a.count === b.count &&
    (a.content ?? null) === (b.content ?? null) &&
    (a.unit ?? null) === (b.unit ?? null)
  )
}
