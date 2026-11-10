import type { ChainRead } from '../types'
import { getChains } from './api'
import snapshot from './chains.generated.json'
import { storeKey } from './storeKey'

// The backend owns the chain table. This side only reads it: the generated
// snapshot until GET /chains answers, then the served copy.
let ownBrandStore = buildIndex(snapshot)
let loading: Promise<void> | null = null

function buildIndex(chains: ChainRead[]): Map<string, string> {
  return new Map(
    chains.flatMap((chain) =>
      chain.own_brands.map((brand) => [brand, chain.name] as const),
    ),
  )
}

/** Fetch the served table once per page load. A failure keeps the copy we
 * have and lets the next call try again. */
export function loadChains(getToken: () => Promise<string>): Promise<void> {
  loading ??= getChains(getToken).then(
    (chains) => {
      ownBrandStore = buildIndex(chains)
    },
    () => {
      loading = null
    },
  )
  return loading
}

export function lookupOwnBrandStore(brand: string | null): string | null {
  if (!brand) return null
  return ownBrandStore.get(brand.toLowerCase().trim()) ?? null
}

// An own brand is only sold at its supermarket, so every path that sets a
// brand adds that store. Returns the same array when there is nothing to add.
export function withOwnBrandStore(
  brand: string | null,
  stores: string[],
): string[] {
  const store = lookupOwnBrandStore(brand)
  if (!store || stores.some((s) => storeKey(s) === storeKey(store))) {
    return stores
  }
  return [...stores, store]
}
