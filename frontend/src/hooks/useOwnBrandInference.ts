import { useEffect, useState } from 'react'
import { lookupOwnBrandStore } from '../lib/ownBrands'
import { storeKey } from '../lib/storeKey'

interface OwnBrandInference {
  visibleChip: string | null
  storeToAdd: string | null
  dismiss: () => void
}

export function useOwnBrandInference(
  brand: string | null,
  explicitStores: string[],
): OwnBrandInference {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(false)
  }, [brand])

  const inferredStore = lookupOwnBrandStore(brand)

  const alreadyAdded =
    inferredStore !== null &&
    explicitStores.some((s) => storeKey(s) === storeKey(inferredStore))

  const active = !dismissed && !alreadyAdded && inferredStore !== null

  return {
    visibleChip: active ? inferredStore : null,
    storeToAdd: active ? inferredStore : null,
    dismiss: () => setDismissed(true),
  }
}
