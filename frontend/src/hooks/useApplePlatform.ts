import { useState } from 'react'

export function useApplePlatform(): boolean {
  const [isApplePlatform] = useState(() => /iPhone|iPad|Mac/.test(navigator.userAgent))
  return isApplePlatform
}
