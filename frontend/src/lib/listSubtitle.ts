/**
 * The dashboard row subtitle: who shares the list, and how much of it is in
 * the cart right now — "Marta y tú · 3 en el carro".
 *
 * The viewer is named "tú" and always goes last; co-members keep their
 * registry order. "en el carro" is invariant — the phrase does not change
 * with the count. A list the viewer keeps alone with nothing in the cart has
 * no subtitle at all, and its row renders compact.
 */

interface SubtitleMember {
  user_id: string
  display_name: string
}

// A structural subset of ListRead. The dashboard cache in localStorage can
// hold list payloads from before members/cart_count existed, so both fields
// must be optional here and absence must read as "nobody else / empty cart".
export interface SubtitleSource {
  members?: SubtitleMember[] | null
  cart_count?: number | null
}

export function listSubtitle(
  list: SubtitleSource,
  currentUserId: string,
): string {
  const others = (list.members ?? [])
    .filter((m) => m.user_id !== currentUserId)
    .map((m) => m.display_name)

  const parts: string[] = []
  if (others.length > 0) parts.push(`${others.join(', ')} y tú`)

  const cart = list.cart_count ?? 0
  if (cart > 0) parts.push(`${cart} en el carro`)

  return parts.join(' · ')
}
