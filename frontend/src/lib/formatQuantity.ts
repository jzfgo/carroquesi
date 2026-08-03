// Display formatter for quantity strings — 30a/21b print «6», «2», «1 KG»,
// «1 L», «6 UD»: number, space, uppercase abbreviated unit. Display-layer
// only: stored values keep whatever the household typed, and a string this
// can't parse passes through untouched (the row's uppercase transform still
// applies to it).

const UNITS: Record<string, string> = {
  u: 'UD',
  ud: 'UD',
  uds: 'UD',
  unidad: 'UD',
  unidades: 'UD',
  g: 'G',
  gr: 'G',
  grs: 'G',
  gramo: 'G',
  gramos: 'G',
  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  kilos: 'KG',
  kilogramo: 'KG',
  kilogramos: 'KG',
  l: 'L',
  litro: 'L',
  litros: 'L',
  ml: 'ML',
  cl: 'CL',
  dl: 'DL',
}

// Parses «487g» / «2 unidades» / «1,5 kg» into a normalized value and unit.
// A bare count carries the UD unit; an unparseable string yields null.
function parse(quantity: string): { value: string; unit: string } | null {
  const m = quantity.trim().match(/^(\d+(?:[.,]\d+)?)\s*(\p{L}+\.?)?$/u)
  if (!m) return null
  // Comma decimal — the same convention the amount column prints.
  const value = m[1].replace('.', ',')
  const rawUnit = m[2]?.replace(/\.$/, '').toLowerCase()
  const unit = rawUnit ? (UNITS[rawUnit] ?? rawUnit.toUpperCase()) : 'UD'
  return { value, unit }
}

/**
 * The full figure — «6 UD», «1 KG», «487 G» — as the bought record's meta
 * line prints it (21b: «6 UD · HACENDADO»).
 */
export function formatQuantity(quantity: string): string {
  const p = parse(quantity)
  return p ? `${p.value} ${p.unit}` : quantity
}

/**
 * The quantity column on unpurchased rows — bare digits per 21b. A plain
 * count drops UD («6», «2»); a weight or volume keeps its unit, where
 * losing it would make the figure ambiguous («1 KG», «1 L»).
 */
export function formatQuantityColumn(quantity: string): string {
  const p = parse(quantity)
  if (!p) return quantity
  return p.unit === 'UD' ? p.value : `${p.value} ${p.unit}`
}
