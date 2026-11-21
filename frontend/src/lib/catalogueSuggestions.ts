import type { ListItem } from '../types'
import { foldText } from './foldText'
import type { PackFormat } from './itemCost'
import { samePack } from './packFormat'

/** The fields Open Food Facts can say something about. */
export type CatalogueField = 'name' | 'brand' | 'pack'

/** What Open Food Facts says about a code. */
export interface Catalogue {
  /** The code the catalogue answered for. */
  ean: string
  name: string
  brand: string | null
  pack: PackFormat | null
}

const ORDER: CatalogueField[] = ['name', 'brand', 'pack']

const sameText = (a: string, b: string) =>
  foldText(a.trim()) === foldText(b.trim())

/**
 * The fields the line already has where the catalogue says something else,
 * in the order the sheet shows them. An empty field is filled, never
 * suggested; a weighed line has no format to suggest.
 */
export function differingFields(
  line: Pick<ListItem, 'name' | 'brand' | 'pack' | 'price_per'>,
  catalogue: Catalogue,
): CatalogueField[] {
  return ORDER.filter((field) => {
    if (field === 'name') {
      return !!catalogue.name && !sameText(line.name, catalogue.name)
    }
    if (field === 'brand') {
      return (
        !!line.brand &&
        !!catalogue.brand &&
        !sameText(line.brand, catalogue.brand)
      )
    }
    if (line.price_per === 'KILOGRAM') return false
    const pack = line.pack ?? null
    return !!pack && !!catalogue.pack && !samePack(pack, catalogue.pack)
  })
}
