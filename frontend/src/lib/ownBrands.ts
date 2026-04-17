const OWN_BRAND_MAP: Record<string, string> = {
  // Mercadona
  'hacendado': 'Mercadona',
  'bosque verde': 'Mercadona',
  'deliplus baby': 'Mercadona',
  'deliplus': 'Mercadona',
  'compy': 'Mercadona',
  // Carrefour
  'carrefour bio': 'Carrefour',
  'carrefour home': 'Carrefour',
  'carrefour soft': 'Carrefour',
  'carrefour': 'Carrefour',
  'selection': 'Carrefour',
  'no. 1': 'Carrefour',
  'tex': 'Carrefour',
  // Lidl
  'milbona': 'Lidl',
  'realvalle': 'Lidl',
  'w5': 'Lidl',
  'formil': 'Lidl',
  'cien': 'Lidl',
  'lupilu': 'Lidl',
  'deluxe': 'Lidl',
  'silvercrest': 'Lidl',
  // Aldi
  'gutbio': 'Aldi',
  'milsani': 'Aldi',
  'tandil': 'Aldi',
  'mildeen': 'Aldi',
  'el mercado': 'Aldi',
  'my night': 'Aldi',
  // DIA
  'dia': 'DIA',
  'as': 'DIA',
  'bonté': 'DIA',
  'delicious': 'DIA',
  'mari marinera': 'DIA',
  'baby smile': 'DIA',
  // Ahorramas
  'alipende': 'Ahorramas',
  'lanta': 'Ahorramas',
  'bodyplus': 'Ahorramas',
  'meque': 'Ahorramas',
  // Alcampo
  'auchan': 'Alcampo',
  'cosmia': 'Alcampo',
  'producto económico': 'Alcampo',
  'inextenso': 'Alcampo',
  // Eroski
  'eroski natur': 'Eroski',
  'eroski': 'Eroski',
  'belle': 'Eroski',
  'seleqtia': 'Eroski',
  'sannia': 'Eroski',
  // El Corte Inglés
  'el corte inglés': 'El Corte Inglés',
  'aliada': 'El Corte Inglés',
  'hipercor': 'El Corte Inglés',
  'special line': 'El Corte Inglés',
  // Gadis
  'ifa eliges': 'Gadis',
  'ifa sabe': 'Gadis',
  'ifa unnia': 'Gadis',
  'peny': 'Gadis',
  'amigo': 'Gadis',
  // Consum
  'consum eco': 'Consum',
  'consum kids': 'Consum',
  'consum': 'Consum',
  'kyrey': 'Consum',
  // BM Supermercados
  'bm': 'BM Supermercados',
  // E.Leclerc
  'marque repère': 'E.Leclerc',
  'eco+': 'E.Leclerc',
  'kado': 'E.Leclerc',
  'tissaia': 'E.Leclerc',
}

export function lookupOwnBrandStore(brand: string | null): string | null {
  if (!brand) return null
  return OWN_BRAND_MAP[brand.toLowerCase().trim()] ?? null
}
