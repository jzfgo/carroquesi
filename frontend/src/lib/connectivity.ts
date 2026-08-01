// Connectivity is judged from evidence, and the last signal wins. Browser
// online/offline events flip the state instantly on a clean disconnect, but
// they miss the common failure — one bar of signal reports online while every
// request times out — so each API request reports its outcome too. Any
// response, even an error status, proves the network works; only a failure to
// reach the server at all counts as offline.
let online = navigator.onLine
const listeners = new Set<() => void>()

function set(value: boolean) {
  if (online === value) return
  online = value
  for (const listener of listeners) listener()
}

export function isOnline(): boolean {
  return online
}

export function reportRequestOutcome(reachedServer: boolean): void {
  set(reachedServer)
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

window.addEventListener('online', () => set(true))
window.addEventListener('offline', () => set(false))
