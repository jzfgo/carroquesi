/**
 * Deterministic store-name key: compare by key, display the typed string.
 *
 * Collapses spelling variants (case, accents, whitespace, punctuation) and
 * nothing else — vocabulary variants like "BM" vs "BM Supermercados" stay
 * apart on purpose. The backend mirrors this in app/services/store_key.py;
 * both are pinned to storeKeyVectors.json — change one only through that
 * file.
 */
export function storeKey(text: string): string {
  const folded = text
    .toLowerCase()
    .normalize('NFD')
    // \p{Mn} only, not \p{M}: the backend strips category Mn and the two
    // implementations must not drift apart at the edges.
    .replace(/\p{Mn}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  const key = folded.replace(/[^\p{L}\p{N}]/gu, '')
  // A punctuation-only name keeps its own key rather than merging into ''.
  return key || folded
}
