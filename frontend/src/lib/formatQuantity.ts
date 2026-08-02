// Display formatter for quantity strings — 30a prints «2 UD», «1 KG», «1 L»:
// number, space, uppercase abbreviated unit, and a unitless count takes UD.
// Display-layer only: stored values keep whatever the household typed, and a
// string this can't parse passes through untouched (the row's uppercase
// transform still applies to it).

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

export function formatQuantity(quantity: string): string {
  const m = quantity.trim().match(/^(\d+(?:[.,]\d+)?)\s*(\p{L}+\.?)?$/u)
  if (!m) return quantity
  // Comma decimal — the same convention the amount column prints.
  const value = m[1].replace('.', ',')
  const rawUnit = m[2]?.replace(/\.$/, '').toLowerCase()
  const unit = rawUnit ? (UNITS[rawUnit] ?? rawUnit.toUpperCase()) : 'UD'
  return `${value} ${unit}`
}
