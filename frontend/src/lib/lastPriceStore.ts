const KEY = "cqs_last_price_store";
const TTL_MS = 60 * 60 * 1000;

interface Stored {
  store: string;
  at: number;
}

export function getLastPriceStore(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { store, at } = JSON.parse(raw) as Stored;
    return Date.now() - at < TTL_MS ? store : null;
  } catch {
    return null;
  }
}

export function setLastPriceStore(store: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ store, at: Date.now() }));
  } catch {
    // ignore quota/security errors — suggestion is best-effort
  }
}
