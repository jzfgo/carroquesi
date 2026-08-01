// Whether the purchase happened on the viewer's current calendar day.
//
// The comparison uses local date components on purpose: the user asking
// "did I buy this today?" means their own today, not the UTC day the
// server stores. The backend judges its copy of this rule in the same
// calendar, from the timezone every request declares.
//
// The API serializes purchased_at as a naive UTC instant, so the string
// gets its Z restored before parsing — unless it already carries one,
// because a doubled suffix parses as Invalid Date and every comparison
// against that is silently false.
export function isSameCalendarDay(purchasedAt: string | null): boolean {
  if (!purchasedAt) return true
  const purchased = new Date(
    purchasedAt.endsWith('Z') ? purchasedAt : purchasedAt + 'Z',
  )
  const now = new Date()
  return (
    purchased.getFullYear() === now.getFullYear() &&
    purchased.getMonth() === now.getMonth() &&
    purchased.getDate() === now.getDate()
  )
}
