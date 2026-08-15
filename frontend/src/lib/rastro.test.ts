import { expect, test } from 'vitest'
import type { ListItem, Member, PriceEntry } from '../types'
import { buildRastro } from './rastro'

function item(over: Partial<ListItem> = {}): ListItem {
  return {
    id: 'i1',
    list_id: 'l1',
    name: 'Leche entera',
    quantity: '6 ud',
    purchased_quantity: null,
    brand: 'Puleva',
    stores: ['Mercadona'],
    purchased: false,
    purchased_at: null,
    purchase_has_receipt: false,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '2026-07-18T09:00:00Z',
    updated_at: '2026-07-18T09:00:00Z',
    ...over,
  }
}

function member(displayName: string): Member {
  return {
    id: 'u1',
    displayName,
    initial: displayName[0],
    color: '#000',
    photoUrl: null,
  }
}

function entry(over: Partial<PriceEntry> = {}): PriceEntry {
  return {
    amount: 5.34,
    is_sin_precio: false,
    price_per: null,
    purchased_at: '2026-07-22T10:00:00Z',
    quantity: '6 ud',
    store: 'Mercadona',
    ...over,
  }
}

const members = new Map<string, Member>([['u1', member('Marta')]])

test('the full sentence names the adder, the span, and the price range', () => {
  const entries: PriceEntry[] = [
    entry({ purchased_at: '2026-03-05T10:00:00Z', amount: 5.2 }),
    entry({ purchased_at: '2026-04-10T10:00:00Z', amount: 5.1 }),
    entry({ purchased_at: '2026-05-01T10:00:00Z', amount: 5.3 }),
    entry({ purchased_at: '2026-05-20T10:00:00Z', amount: 5.79 }),
    entry({ purchased_at: '2026-06-02T10:00:00Z', amount: 5.4 }),
    entry({ purchased_at: '2026-06-18T10:00:00Z', amount: 5.5 }),
    entry({ purchased_at: '2026-07-08T10:00:00Z', amount: 5.49 }),
    entry({ purchased_at: '2026-07-22T10:00:00Z', amount: 5.34 }),
  ]
  expect(buildRastro(item(), members, entries)).toBe(
    'Lo añadió Marta el 18 jul. Comprado 8 veces desde marzo, la última el 22 jul. Se paga entre € 5,10 y € 5,79.',
  )
})

test('an adder who has left the list drops the name, never renders "undefined"', () => {
  const result = buildRastro(item(), new Map(), [entry()])
  expect(result).not.toContain('undefined')
  expect(result).toContain('Añadido el 18 jul.')
  expect(result).not.toContain('Lo añadió')
})

test('a single purchase reads "una vez", with no span', () => {
  const result = buildRastro(item(), members, [
    entry({ purchased_at: '2026-07-22T10:00:00Z', amount: 5.34 }),
  ])
  expect(result).toContain('Comprado una vez el 22 jul.')
  expect(result).not.toContain('veces')
})

test('no purchases at all: only the adder clause remains', () => {
  expect(buildRastro(item(), members, [])).toBe('Lo añadió Marta el 18 jul.')
})

test('an equal price floor and ceiling reads "Siempre a"', () => {
  const result = buildRastro(item(), members, [
    entry({ purchased_at: '2026-07-01T10:00:00Z', amount: 5.34 }),
    entry({ purchased_at: '2026-07-22T10:00:00Z', amount: 5.34 }),
  ])
  expect(result).toContain('Siempre a € 5,34.')
  expect(result).not.toContain('entre')
})

test('a price-less purchase counts toward the span but not the price range', () => {
  const result = buildRastro(item(), members, [
    entry({ purchased_at: '2026-03-05T10:00:00Z', amount: 5.34 }),
    entry({
      purchased_at: '2026-07-22T10:00:00Z',
      amount: null,
      is_sin_precio: true,
    }),
  ])
  expect(result).toContain('Comprado 2 veces desde marzo, la última el 22 jul.')
  expect(result).toContain('Siempre a € 5,34.')
})

test('the date is read off the ISO string, not the runner timezone', () => {
  // A late-evening UTC instant lands on a different calendar day east or west
  // of UTC; the label must stay «22 jul» regardless.
  const result = buildRastro(
    item({ created_at: '2026-07-22T23:30:00Z' }),
    members,
    [],
  )
  expect(result).toBe('Lo añadió Marta el 22 jul.')
})
