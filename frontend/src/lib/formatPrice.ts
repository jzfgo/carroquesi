export function formatPrice(amount: number, pricePer?: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted
}

/**
 * The bare figure an item row prints — «8,15» per 30a/21b: comma decimal,
 * no symbol. The € belongs to sheet-header totals, and any /UD·/KG suffix
 * is the row's to add.
 */
export function formatRowAmount(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * A hand-typed money amount as a number, or null when it is blank or invalid.
 * Accepts the comma decimal people actually type («8,15»); a negative or
 * non-finite figure is rejected as no amount rather than a bad one.
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const n = parseFloat(trimmed.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}
