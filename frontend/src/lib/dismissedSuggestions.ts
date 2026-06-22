const KEY = 'cqs_dismissed_suggestions';

let cache: Record<string, string> | null = null;

function read(): Record<string, string> {
  if (cache !== null) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<
      string,
      string
    >;
  } catch {
    cache = {};
  }
  return cache;
}

function write(map: Record<string, string>) {
  cache = map;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function _resetCacheForTesting() {
  cache = null;
}

export function isDismissed(name: string): boolean {
  const expiry = read()[name];
  if (!expiry) return false;
  return Date.now() < Date.parse(expiry);
}

export function writeDismissal(name: string, ttlDays: number): void {
  const map = { ...read() };
  const now = Date.now();
  for (const [k, v] of Object.entries(map)) {
    if (now >= Date.parse(v)) delete map[k];
  }
  map[name] = new Date(now + ttlDays * 86400000).toISOString();
  write(map);
}
