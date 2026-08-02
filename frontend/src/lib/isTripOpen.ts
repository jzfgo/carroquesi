// Whether the trip a purchase belongs to is still taking items.
//
// purchase_ends_at is the instant the item's trip stops accepting changes —
// closed by hand, or torn off at the local midnight stamped when the trip
// opened. The server computes it; this mirror only saves a round-trip.
//
// A missing value answers "open" on purpose: an optimistic write has no
// trip yet, and a permissive mirror is safe because the server enforces
// the real rule on every request.
//
// The API serializes the instant as naive UTC, so the string gets its Z
// restored before parsing — unless it already carries one, because a
// doubled suffix parses as Invalid Date and every comparison against that
// is silently false.
export function isTripOpen(purchaseEndsAt: string | null | undefined): boolean {
  if (!purchaseEndsAt) return true
  const endsAt = new Date(
    purchaseEndsAt.endsWith('Z') ? purchaseEndsAt : purchaseEndsAt + 'Z',
  )
  return endsAt.getTime() > Date.now()
}
