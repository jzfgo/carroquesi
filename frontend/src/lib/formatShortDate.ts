const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/

/**
 * Read a stored instant.
 *
 * The backend stamps every one as naive UTC — no offset, no Z — and a bare
 * parse lets the engine call that local time. An instant late in the UTC
 * evening then prints the day before the one it happened on, for every reader
 * east of Greenwich. The same purchase already reads correctly on the list
 * screen, which goes the long way round and appends the Z itself.
 *
 * Anything that already names its zone is left as it is. Not every string
 * arriving here comes from the API — a fixture may carry a Z — and appending a
 * second one parses to nothing at all.
 */
function parse(iso: string): Date {
  return new Date(HAS_ZONE.test(iso) ? iso : `${iso}Z`)
}

/** "22 jul" — the form every date in the item sheet takes. */
export function formatShortDate(iso: string): string {
  return parse(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
}

/** "julio" — the month a run of purchases started in. */
export function formatMonth(iso: string): string {
  return parse(iso).toLocaleDateString('es-ES', { month: 'long' })
}
