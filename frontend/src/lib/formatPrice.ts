export function formatPrice(amount: number, pricePer?: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted
}
