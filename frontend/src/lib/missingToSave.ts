/** What still keeps a purchase from saving. */
export interface MissingToSave {
  store: boolean
  date: boolean
  /** Checked receipt lines with no product yet. */
  unnamedLines: number
  /** Nothing would be saved: no receipt line is checked (`ticket`), or no
   *  product from the list is left in the close (`cart`). */
  nothingToSave?: 'ticket' | 'cart' | null
}

const NOTHING_TO_SAVE = {
  ticket: 'marca al menos una línea',
  cart: 'deja al menos un producto del carro',
}

/**
 * The sentence over a disabled save button: what to do so the purchase can
 * save. Null when nothing is missing.
 */
export function missingToSaveText({
  store,
  date,
  unnamedLines,
  nothingToSave = null,
}: MissingToSave): string | null {
  const fields = [store && 'la tienda', date && 'la fecha'].filter(Boolean)
  const steps = [
    fields.length > 0 && `indica ${fields.join(' y ')}`,
    unnamedLines > 0 &&
      `asigna un producto a ${unnamedLines} ${unnamedLines === 1 ? 'línea' : 'líneas'}`,
    nothingToSave && NOTHING_TO_SAVE[nothingToSave],
  ].filter(Boolean)
  if (steps.length === 0) return null
  const todo = steps.join(' y ')
  return `${todo.charAt(0).toUpperCase()}${todo.slice(1)} para guardar esta compra`
}
