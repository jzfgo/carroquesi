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
import { ADD_STORE } from './StoreSelect'

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
    purchase_has_receipt: false,
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

test('the store dropdown defaults to the first offer and selects another', async () => {
  renderSheet([
    item({ id: 'a', stores: ['Mercadona'] }),
    item({ id: 'b', stores: ['Lidl'] }),
  ])
  const select = screen.getByLabelText<HTMLSelectElement>('Tienda')
  expect(select.value).toBe('Mercadona')
  fireEvent.change(select, { target: { value: 'Lidl' } })
  expect(select.value).toBe('Lidl')
  fireEvent.click(screen.getByText('Guardar compra'))
  await waitFor(() => expect(closePurchase).toHaveBeenCalled())
  expect(vi.mocked(closePurchase).mock.calls.at(-1)![2].store).toBe('Lidl')
})

test('a store-less cart still offers registry stores and «+ otra»', async () => {
  render(
    <CloseTripSheet
      listId="l1"
      getToken={getToken}
      cartItems={[item({ id: 'a', stores: [] })]}
      storeOptions={['Mercadona', 'Lidl']}
      displayStore={(s) => s}
      onClose={vi.fn()}
      onDone={vi.fn()}
    />,
  )
  // Registry stores are offered though the cart names none.
  expect(screen.getByRole('option', { name: 'Mercadona' })).toBeInTheDocument()
  // «+ otra» opens the «Nueva tienda» step; the typed store is confirmed
  // there, joins the offer, and is what saves.
  fireEvent.change(screen.getByLabelText('Tienda'), {
    target: { value: ADD_STORE },
  })
  fireEvent.change(screen.getByPlaceholderText('Nombre de la tienda'), {
    target: { value: 'Ahorramás' },
  })
  fireEvent.click(screen.getByText('Usar esta tienda'))
  fireEvent.click(screen.getByText('Guardar compra'))
  await waitFor(() => expect(closePurchase).toHaveBeenCalled())
  const body = vi.mocked(closePurchase).mock.calls.at(-1)![2]
  expect(body.store).toBe('Ahorramás')
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

test('a proto close defaults its date to the day it covered, not today', async () => {
  // A proto's lines are fetched; seed one so the save has something to claim.
  vi.mocked(getPurchaseItems).mockResolvedValue([
    item({ id: 'a', name: 'Leche', price: 1.9, stores: ['Lidl'] }),
  ])
  render(
    <CloseTripSheet
      listId="l1"
      getToken={getToken}
      purchaseId="p1"
      initialDate="2026-07-30"
      storeOptions={['Lidl']}
      displayStore={(s) => s}
      onClose={vi.fn()}
      onDone={vi.fn()}
    />,
  )
  await waitFor(() => expect(screen.getByText('Leche')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Guardar compra'))
  await waitFor(() => expect(closePurchase).toHaveBeenCalled())
  const body = vi.mocked(closePurchase).mock.calls.at(-1)![2]
  expect(body.date).toBe('2026-07-30')
  expect(body.purchase_id).toBe('p1')
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
  // While suggested, the dashed badge also says its state for screen readers.
  expect(screen.getByText('(precio sugerido)')).toBeInTheDocument()
  fireEvent.click(screen.getByText(/Confirmar el precio sugerido/))
  // Confirmed → it now counts toward the total and drops the suggested voice.
  await waitFor(() => expect(screen.getByText('€ 2,50')).toBeInTheDocument())
  expect(screen.queryByText('(precio sugerido)')).not.toBeInTheDocument()
})

test('the pencil opens the adjust-product editor (10d)', () => {
  renderSheet([item({ id: 'a', name: 'Leche' })])
  fireEvent.click(screen.getByLabelText('Ajustar Leche'))
  // 10d is a sub-sheet with a back-galón and the Producto field.
  expect(screen.getByText('Producto')).toBeInTheDocument()
})
