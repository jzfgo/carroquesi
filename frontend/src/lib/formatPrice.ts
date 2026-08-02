export function formatPrice(amount: number, pricePer?: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted
}

/**
 * The bare amount an item row prints — «8,15» per 30a: comma decimal, no
 * symbol. The € belongs to sheet-header totals. A per-kg unit price keeps
 * its /kg so it never reads as a line total.
 */
export function formatRowAmount(
  amount: number,
  pricePer?: string | null,
): string {
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted
}
