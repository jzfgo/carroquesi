import { parseServerInstant } from './serverInstant'

// Whether the trip a purchase belongs to is still taking items.
//
// purchase_ends_at is the instant the item's trip stops accepting changes —
// closed by hand, or torn off at the local midnight stamped when the trip
// opened. The server computes it; this mirror only saves a round-trip.
//
// A missing value answers "open" on purpose: an optimistic write has no
// trip yet, and a permissive mirror is safe because the server enforces
// the real rule on every request.
export function isTripOpen(purchaseEndsAt: string | null | undefined): boolean {
  if (!purchaseEndsAt) return true
  const endsAt = parseServerInstant(purchaseEndsAt)
  return endsAt.getTime() > Date.now()
}
