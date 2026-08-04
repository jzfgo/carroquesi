import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  closePurchase,
  getPriceHistory,
  getPurchaseItems,
  updateItem,
} from '../lib/api'
import type { ListItem } from '../types'
import { CloseTripSheet } from './CloseTripSheet'

vi.mock('../lib/api', () => ({
  closePurchase: vi.fn(),
  getPriceHistory: vi.fn(),
  getPurchaseItems: vi.fn(),
  updateItem: vi.fn(),
}))

const getToken = () => Promise.resolve('t')

function item(over: Partial<ListItem> = {}): ListItem {
  return {
    id: 'i1',
    list_id: 'l1',
    name: 'Leche',
    quantity: '1',
    purchased_quantity: null,
    brand: null,
    stores: ['Mercadona'],
    purchased: true,
    purchased_at: '2026-08-04T09:00:00',
    purchase_ends_at: '2099-01-01T00:00:00',
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '',
    updated_at: '',
    ...over,
  }
}

beforeEach(() => {
  vi.mocked(getPriceHistory).mockResolvedValue({ entries: [] })
  vi.mocked(closePurchase).mockResolvedValue({} as never)
  vi.mocked(getPurchaseItems).mockResolvedValue([])
  vi.mocked(updateItem).mockResolvedValue({} as never)
})

function renderSheet(cartItems: ListItem[]) {
  const onDone = vi.fn()
  render(
    <CloseTripSheet
      listId="l1"
      getToken={getToken}
      cartItems={cartItems}
      displayStore={(s) => s}
      onClose={vi.fn()}
      onDone={onDone}
    />,
  )
  return { onDone }
}

test('renders each line and sums the confirmed total', () => {
  renderSheet([
    item({ id: 'a', name: 'Leche', price: 1.9, quantity: '1' }),
    item({ id: 'b', name: 'Café', price: 3.29, quantity: '1' }),
  ])
  expect(screen.getByText('Leche')).toBeInTheDocument()
  expect(screen.getByText('Café')).toBeInTheDocument()
  // 1,90 + 3,29 = 5,19
  expect(screen.getByText('€ 5,19')).toBeInTheDocument()
})

test('store chips select one store', () => {
  renderSheet([
    item({ id: 'a', stores: ['Mercadona'] }),
    item({ id: 'b', stores: ['Lidl'] }),
  ])
  const lidl = screen.getByText('Lidl')
  expect(lidl.className).not.toContain('close-chip--on')
  fireEvent.click(lidl)
  expect(lidl.className).toContain('close-chip--on')
})

test('«Guardar compra» closes with the store, date and per-line fields', async () => {
  const { onDone } = renderSheet([
    item({
      id: 'a',
      name: 'Leche',
      price: 1.9,
      quantity: '2',
      brand: 'Hacendado',
    }),
  ])
  fireEvent.click(screen.getByText('Guardar compra'))
  await waitFor(() => expect(closePurchase).toHaveBeenCalled())
  const body = vi.mocked(closePurchase).mock.calls[0][2]
  expect(body.store).toBe('Mercadona')
  expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(body.lines[0]).toMatchObject({
    item_id: 'a',
    price: 1.9,
    quantity: '2',
    name: 'Leche',
    brand: 'Hacendado',
  })
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})

test('«Confirmar los precios sugeridos» applies the inherited price', async () => {
  vi.mocked(getPriceHistory).mockResolvedValue({
    entries: [
      {
        amount: 2.5,
        price_per: null,
        store: 'Mercadona',
        purchased_at: '2026-07-01T09:00:00',
        quantity: '1',
        is_sin_precio: false,
      },
    ],
  })
  renderSheet([item({ id: 'a', name: 'Leche', price: null, quantity: '1' })])

  // The suggestion arrives and the batch-confirm row appears.
  await waitFor(() =>
    expect(
      screen.getByText(/Confirmar el precio sugerido/),
    ).toBeInTheDocument(),
  )
  fireEvent.click(screen.getByText(/Confirmar el precio sugerido/))
  // Confirmed → it now counts toward the total.
  await waitFor(() => expect(screen.getByText('€ 2,50')).toBeInTheDocument())
})

test('the pencil opens the adjust-product editor (10d)', () => {
  renderSheet([item({ id: 'a', name: 'Leche' })])
  fireEvent.click(screen.getByLabelText('Ajustar Leche'))
  // 10d is a sub-sheet with a back-galón and the Producto field.
  expect(screen.getByText('Producto')).toBeInTheDocument()
})
