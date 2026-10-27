/**
 * Fold text for search: lowercase and strip accents, so "pimenton" finds
 * "Pimentón" and "PIMENTÓN". Nothing else changes, so a fold-then-includes
 * test stays a plain substring match. The backend's fold_name does the same.
 */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
}
