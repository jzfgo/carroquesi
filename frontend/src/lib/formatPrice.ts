/** Joins a figure to its «€» so the sign never wraps onto a line alone. */
const NBSP = ' '

// es-ES groups only from five digits by default; a receipt prints «1.234,50».
const FIGURE = new Intl.NumberFormat('es-ES', {
  useGrouping: 'always',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * The bare figure, «8,15» or «1.234,50»: comma decimal, no symbol. Use it for text a
 * person edits (an input's value or placeholder) and for a figure whose «€»
 * sits in its own element. Everything else goes through `formatAmount` or
 * `formatUnitPrice`, so the sign is never left out.
 */
export function formatFigure(amount: number): string {
  return FIGURE.format(amount)
}

/** An amount, «3,05 €»: in Spain the sign goes after the figure. */
export function formatAmount(amount: number): string {
  return `${formatFigure(amount)}${NBSP}€`
}

/**
 * The unit a price is per, with its sign: «€/kg» or «€/ud». `caps` is the
 * mono caps voice of bought rows: «€/KG», «€/UD».
 */
export function unitPriceSuffix(
  pricePer: string | null | undefined,
  caps = false,
): string {
  const unit = pricePer === 'KILOGRAM' ? 'kg' : 'ud'
  return `€/${caps ? unit.toUpperCase() : unit}`
}

/** A unit price, «8,82 €/kg» or «0,89 €/ud» (`caps`: «0,89 €/UD»). */
export function formatUnitPrice(
  amount: number,
  pricePer: string | null | undefined,
  caps = false,
): string {
  return `${formatFigure(amount)}${NBSP}${unitPriceSuffix(pricePer, caps)}`
}

/**
 * A hand-typed money amount as a number, or null when it is blank or invalid.
 * Accepts the comma decimal people actually type («8,15»), and the grouped
 * figure `formatFigure` seeds a field with («1.234,50»): with a comma
 * present, a dot can only group thousands. A negative or non-finite figure
 * is rejected as no amount rather than a bad one.
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const plain = trimmed.includes(',')
    ? trimmed.replaceAll('.', '').replace(',', '.')
    : trimmed
  const n = parseFloat(plain)
  return Number.isFinite(n) && n >= 0 ? n : null
}
