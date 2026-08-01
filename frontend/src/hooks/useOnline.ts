import { useSyncExternalStore } from 'react'
import { isOnline, subscribe } from '../lib/connectivity'

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline)
}
