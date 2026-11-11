import { describe, expect, it } from 'vitest'
import { missingToSaveText } from './missingToSave'

describe('missingToSaveText', () => {
  it('is null when nothing is missing', () => {
    expect(
      missingToSaveText({ store: false, date: false, unnamedLines: 0 }),
    ).toBeNull()
  })

  it('names one missing field', () => {
    expect(
      missingToSaveText({ store: true, date: false, unnamedLines: 0 }),
    ).toBe('Indica la tienda para guardar esta compra')
    expect(
      missingToSaveText({ store: false, date: true, unnamedLines: 0 }),
    ).toBe('Indica la fecha para guardar esta compra')
  })

  it('joins the store and the date', () => {
    expect(
      missingToSaveText({ store: true, date: true, unnamedLines: 0 }),
    ).toBe('Indica la tienda y la fecha para guardar esta compra')
  })

  it('counts unnamed lines, singular and plural', () => {
    expect(
      missingToSaveText({ store: false, date: false, unnamedLines: 1 }),
    ).toBe('Asigna un producto a 1 línea para guardar esta compra')
    expect(
      missingToSaveText({ store: false, date: false, unnamedLines: 2 }),
    ).toBe('Asigna un producto a 2 líneas para guardar esta compra')
  })

  it('asks for something to save', () => {
    expect(
      missingToSaveText({
        store: false,
        date: false,
        unnamedLines: 0,
        nothingToSave: 'ticket',
      }),
    ).toBe('Marca al menos una línea para guardar esta compra')
    expect(
      missingToSaveText({
        store: true,
        date: false,
        unnamedLines: 0,
        nothingToSave: 'cart',
      }),
    ).toBe(
      'Indica la tienda y deja al menos un producto del carro para guardar esta compra',
    )
  })

  it('says everything in one sentence', () => {
    expect(
      missingToSaveText({ store: true, date: true, unnamedLines: 2 }),
    ).toBe(
      'Indica la tienda y la fecha y asigna un producto a 2 líneas para guardar esta compra',
    )
  })
})
