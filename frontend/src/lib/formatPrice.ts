export const COMMUNITY_PRICE_TOOLTIP =
  'Precio medio de la comunidad de Open Prices, filtrado a tiendas españolas cuando hay datos disponibles. Puede no reflejar los precios actuales.';

export function formatPrice(amount: number, pricePer?: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted;
}
