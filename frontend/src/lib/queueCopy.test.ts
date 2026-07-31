import { describe, expect, it } from 'vitest'
import { HELD_FOR_ADD, type QueuedOp } from './offlineQueue'
import { failureCause, isRetryable, opKind, whenLabel } from './queueCopy'

function op(over: Partial<QueuedOp>): QueuedOp {
  return {
    id: 'q1',
    listId: 'l1',
    type: 'updateItem',
    payload: {},
    enqueuedAt: 0,
    label: 'Pan',
    ...over,
  }
}

describe('opKind', () => {
  it('names what was done, not the endpoint', () => {
    expect(opKind(op({ type: 'addItem' }))).toBe('Añadido')
    expect(opKind(op({ type: 'deleteItem' }))).toBe('Eliminado')
    expect(opKind(op({ type: 'closePurchase' }))).toBe('Compra')
  })

  // Every one of these is updateItem. The patch's keys are the only thing
  // that tells them apart, and to whoever has to recognise the line they are
  // not the same change at all.
  it('reads an edit from the keys of its patch', () => {
    const kind = (patch: Record<string, unknown>) =>
      opKind(op({ type: 'updateItem', payload: { itemId: 'i1', patch } }))

    expect(kind({ purchased: true })).toBe('En el carro')
    expect(kind({ purchased: false })).toBe('Sacado del carro')
    expect(kind({ name: 'Pan de molde' })).toBe('Renombrado')
    expect(kind({ price: 1.9 })).toBe('Precio')
    expect(kind({ quantity: '2' })).toBe('Cantidad')
    expect(kind({ brand: 'Puleva' })).toBe('Marca')
    expect(kind({ stores: ['Lidl'] })).toBe('Tienda')
    expect(kind({ ean: '123' })).toBe('Editado')
  })

  it('falls back rather than throwing on a payload with no patch', () => {
    expect(opKind(op({ type: 'updateItem', payload: null }))).toBe('Editado')
  })
})

describe('failureCause', () => {
  // The same status means different things depending on what was being sent:
  // a 404 on an add is the list, and on an edit it is the product.
  it('answers for the thing that was actually being written', () => {
    expect(failureCause(404, 'addItem')).toBe('la lista ya no existe')
    expect(failureCause(404, 'closePurchase')).toBe('la lista ya no existe')
    expect(failureCause(404, 'updateItem')).toBe('el producto ya no existe')
    expect(failureCause(404, 'deleteItem')).toBe('el producto ya no existe')
    expect(failureCause(409, 'addItem')).toBe('ya estaba en la lista')
    expect(failureCause(409, 'updateItem')).toBe('la compra ya está archivada')
  })

  /**
   * A held op was never sent, so nothing answered it. Falling through to the
   * default would blame a server that was never asked — the same kind of lie
   * as telling somebody the product was deleted when it was never created.
   */
  it('does not blame the server for something it never saw', () => {
    expect(failureCause(HELD_FOR_ADD, 'updateItem')).toBe(
      'espera a que se añada el producto',
    )
    expect(failureCause(HELD_FOR_ADD, 'closePurchase')).toBe(
      'espera a que se añada el producto',
    )
  })

  it('says the rest in the language of the house', () => {
    expect(failureCause(400, 'addItem')).toBe('el servidor no lo aceptó')
    expect(failureCause(422, 'addItem')).toBe('el servidor no lo aceptó')
    expect(failureCause(401, 'addItem')).toBe('hubo que volver a entrar')
    expect(failureCause(403, 'addItem')).toBe('sin permiso en esa lista')
    expect(failureCause(503, 'addItem')).toBe('el servidor falló')
  })
})

describe('isRetryable', () => {
  // A status that states a fact about the data will say the same thing to the
  // same request, so the line is drawn without a control known to fail.
  it('refuses a retry that can never end differently', () => {
    for (const status of [400, 404, 409, 422]) {
      expect(isRetryable(status)).toBe(false)
    }
  })

  it('offers one where the answer can change', () => {
    for (const status of [401, 403, 408, 429, 500, 503]) {
      expect(isRetryable(status)).toBe(true)
    }
  })

  // No HTTP answer to read — a failure on this side. Not knowing why is not
  // the same as knowing it can never work.
  it('offers one when there was no answer at all', () => {
    expect(isRetryable(0)).toBe(true)
  })

  // A held op is the whole reason «Reintentar los N» exists: it goes out in
  // the pass that lands the add it waits on. Foreclosing on it here would
  // leave it in the sheet with no way out but discarding.
  it('offers one on something only held back', () => {
    expect(isRetryable(HELD_FOR_ADD)).toBe(true)
  })
})

describe('whenLabel', () => {
  // Built from local date parts on both ends. The unit suite runs at the
  // machine's zone rather than Madrid, so anchoring on a UTC instant would
  // make this pass or fail depending on who ran it.
  const at = (y: number, m: number, d: number, h: number, min: number) =>
    new Date(y, m, d, h, min).getTime()

  const now = at(2026, 6, 31, 12, 0)

  it('says today for the same calendar day', () => {
    expect(whenLabel(at(2026, 6, 31, 8, 10), now)).toBe('hoy 8:10')
  })

  it('says yesterday for the day before', () => {
    expect(whenLabel(at(2026, 6, 30, 19, 42), now)).toBe('ayer 19:42')
  })

  it('names the day once it is older than that', () => {
    expect(whenLabel(at(2026, 6, 12, 19, 42), now)).toBe('12 jul 19:42')
  })

  // Two hours apart across midnight is a different day, not "two hours ago".
  it('counts calendar days, not elapsed hours', () => {
    expect(whenLabel(at(2026, 6, 30, 23, 30), at(2026, 6, 31, 1, 0))).toBe(
      'ayer 23:30',
    )
  })
})
