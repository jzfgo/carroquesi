/** "22 jul" — the form every date in the item sheet takes. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
}
