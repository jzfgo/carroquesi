const KEY = 'cqs_dismissed_suggestions'

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function isDismissed(name: string): boolean {
  const map = read()
  const expiry = map[name]
  if (!expiry) return false
  return Date.now() < Date.parse(expiry)
}

export function writeDismissal(name: string, ttlDays: number): void {
  const map = read()
  const now = Date.now()
  for (const [k, v] of Object.entries(map)) {
    if (Date.now() >= Date.parse(v)) delete map[k]
  }
  map[name] = new Date(now + ttlDays * 86400000).toISOString()
  localStorage.setItem(KEY, JSON.stringify(map))
}
