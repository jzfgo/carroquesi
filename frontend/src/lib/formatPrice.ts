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
