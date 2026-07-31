export const COMMUNITY_PRICE_TOOLTIP =
  'Precio medio de la comunidad de Open Prices, filtrado a tiendas españolas cuando hay datos disponibles. Puede no reflejar los precios actuales.'

// The house format is "€ 5,34": symbol first, comma decimal, a space between.
// No locale produces it — es-ES puts the symbol last, en-US uses a dot — so the
// number is formatted on its own and the symbol is written in front of it.
// Leaving the locale to the machine is what let the whole app print "€5.34".
const AMOUNT = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPrice(amount: number, pricePer?: string | null): string {
  const formatted = `€ ${AMOUNT.format(amount)}`
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted
}
