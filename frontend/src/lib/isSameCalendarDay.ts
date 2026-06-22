export function isSameCalendarDay(purchasedAt: string | null): boolean {
  if (!purchasedAt) return true
  const today = new Date().toISOString().slice(0, 10)
  return purchasedAt.slice(0, 10) === today
}
