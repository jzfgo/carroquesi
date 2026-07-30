import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPurchases } from '../lib/api'
import type { Purchase } from '../types'

/**
 * The trips behind a list's receipt headers.
 *
 * Refetched by its caller whenever the items change, which is the same
 * `updated_at` signal the item poll already watches — a trip only ever
 * changes as part of an item write, so this needs no clock of its own.
 *
 * `getToken` must keep a stable identity across renders, or the effect below
 * refetches on every one. The auth context already hands out a stable one,
 * which is what the item hook relies on too.
 */
export function usePurchases(listId: string, getToken: () => Promise<string>) {
  const [purchases, setPurchases] = useState<Purchase[]>([])

  const refresh = useCallback(() => {
    getPurchases(getToken, listId)
      .then(setPurchases)
      // Offline, or a list just deleted. The headers fall back to the date
      // and the derived sum, which is a poorer ticket rather than a broken
      // screen.
      .catch(() => {})
  }, [listId, getToken])

  useEffect(() => {
    refresh()
  }, [refresh])

  const byId = useMemo(
    () => new Map(purchases.map((p) => [p.id, p])),
    [purchases],
  )

  return { purchases, byId, refresh }
}
