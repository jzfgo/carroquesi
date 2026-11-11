import { storeKey } from './storeKey'

/**
 * The stores a store dropdown offers: one per store key, in first-seen
 * order, each labelled with its registry name. Empty values are skipped.
 */
export function storeOffer(
  raws: (string | null | undefined)[],
  displayStore: (raw: string) => string,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of raws) {
    if (!raw) continue
    const key = storeKey(raw)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(displayStore(raw))
  }
  return out
}

/** Adds a hand-typed store to the extra offers, unless its key is there. */
export function withExtraStore(extra: string[], store: string): string[] {
  return extra.some((x) => storeKey(x) === storeKey(store))
    ? extra
    : [...extra, store]
}
