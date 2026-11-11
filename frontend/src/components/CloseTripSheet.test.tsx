import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  closePurchase,
  getLabel,
  getPriceHistory,
  getPurchaseItems,
  updateItem,
} from '../lib/api'
import { reportRequestOutcome } from '../lib/connectivity'
import type { LabelRead, ListItem } from '../types'
import { CloseTripSheet } from './CloseTripSheet'
import { ADD_STORE } from './StoreSelect'

vi.mock('../lib/api', () => ({
  closePurchase: vi.fn(),
  getLabel: vi.fn(),
  getPriceHistory: vi.fn(),
  getPurchaseItems: vi.fn(),
  updateItem: vi.fn(),
}))

// The camera is LabelScanner's to test; here a read is a button.
vi.mock('./LabelScanner', () => ({
  LabelScanner: ({
    onDetect,
    onClose,
  }: {
    onDetect: (code: string | null) => void
    onClose: () => void
  }) => (
    <div>
      <button onClick={() => onDetect('230123450034600882003052')}>
        leer etiqueta
      </button>
      <button onClick={onClose}>Cerrar escáner</button>
    </div>
  ),
}))

// The frames' «Contramuslo deshuesado»: 346 g at 8,82 €/kg is 3,05.
const LABEL: LabelRead = {
  format: 'mercadona-24',
  article: '01234',
  reduced: false,
  weight_g: 346,
  price_per_kg_cents: 882,
  total_cents: 305,
  chain: 'Mercadona',
}

const showToast = vi.fn()

afterEach(() => {
  reportRequestOutcome(true)
})

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
    bought_by_weight: false,
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
      showToast={showToast}
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
      showToast={showToast}
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
      showToast={showToast}
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

const chip = (name: string) =>
  screen.queryByRole('button', { name: `Escanear la etiqueta de «${name}»` })

async function scanAndUse() {
  fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Usar en esta línea' }),
  )
}

test('«Peso» shows on one-unit lines with no EAN, at a store whose labels weigh', () => {
  renderSheet([
    item({ id: 'a', name: 'Contramuslo', quantity: '1' }),
    item({ id: 'b', name: 'Leche', quantity: '6' }),
    item({ id: 'c', name: 'Aceite', quantity: '1', ean: '8480000123456' }),
    item({
      id: 'd',
      name: 'Pechuga',
      quantity: '1',
      ean: '8480000654321',
      bought_by_weight: true,
    }),
  ])
  expect(chip('Contramuslo')).toBeInTheDocument()
  expect(chip('Leche')).not.toBeInTheDocument()
  expect(chip('Aceite')).not.toBeInTheDocument()
  expect(chip('Pechuga')).toBeInTheDocument()
})

test('a scanned label sets the line: weight, €/kg and amount', async () => {
  vi.mocked(getLabel).mockResolvedValue(LABEL)
  renderSheet([item({ id: 'a', name: 'Contramuslo', quantity: '1' })])
  fireEvent.click(chip('Contramuslo')!)
  await scanAndUse()
  expect(screen.getByText('0,346 kg')).toBeInTheDocument()
  expect(screen.getByText('3,05')).toBeInTheDocument()
  expect(screen.getByText('8,82 €/kg · de la etiqueta')).toBeInTheDocument()
  expect(chip('Contramuslo')).not.toBeInTheDocument()

  fireEvent.click(screen.getByText('Guardar compra'))
  await waitFor(() => expect(closePurchase).toHaveBeenCalled())
  const body = vi.mocked(closePurchase).mock.calls.at(-1)![2]
  expect(body.lines[0]).toMatchObject({
    item_id: 'a',
    quantity: '0,346 kg',
    price: 8.82,
    price_per: 'KILOGRAM',
    article: '01234',
  })
})

test('the label is decoded against the selected store', async () => {
  vi.mocked(getLabel).mockResolvedValue(LABEL)
  renderSheet([item({ id: 'a', name: 'Contramuslo', quantity: '1' })])
  fireEvent.click(chip('Contramuslo')!)
  fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
  await waitFor(() =>
    expect(getLabel).toHaveBeenCalledWith(
      getToken,
      '230123450034600882003052',
      'Mercadona',
    ),
  )
})

test('another store hides the chip, and a scanned line keeps its label', async () => {
  vi.mocked(getLabel).mockResolvedValue(LABEL)
  renderSheet([
    item({
      id: 'a',
      name: 'Contramuslo',
      quantity: '1',
      stores: ['Mercadona'],
    }),
    item({ id: 'b', name: 'Pan', quantity: '1', stores: ['Ahorramas'] }),
  ])
  fireEvent.click(chip('Contramuslo')!)
  await scanAndUse()
  expect(chip('Pan')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Tienda'), {
    target: { value: 'Ahorramas' },
  })
  expect(chip('Pan')).not.toBeInTheDocument()
  expect(screen.getByText('0,346 kg')).toBeInTheDocument()
})

test('the same label on a second line warns', async () => {
  vi.mocked(getLabel).mockResolvedValue(LABEL)
  renderSheet([
    item({ id: 'a', name: 'Contramuslo', quantity: '1' }),
    item({ id: 'b', name: 'Pechuga', quantity: '1' }),
  ])
  fireEvent.click(chip('Contramuslo')!)
  await scanAndUse()
  fireEvent.click(chip('Pechuga')!)
  fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
  expect(
    await screen.findByText(
      /Esta etiqueta ya está en otra línea de Contramuslo\./,
    ),
  ).toBeInTheDocument()
})

test('the 10d editor scans too, and keeps what was typed', async () => {
  vi.mocked(getLabel).mockResolvedValue(LABEL)
  renderSheet([item({ id: 'a', name: 'Contramuslo', quantity: '2' })])
  fireEvent.click(screen.getByLabelText('Ajustar Contramuslo'))
  fireEvent.change(screen.getByPlaceholderText('Nombre del producto'), {
    target: { value: 'Contramuslo deshuesado' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Escanear etiqueta' }))
  await scanAndUse()
  expect(screen.getByDisplayValue('Contramuslo deshuesado')).toBeInTheDocument()
  expect(screen.getByDisplayValue('0,346 kg')).toBeInTheDocument()
  expect(screen.getByDisplayValue('8,82')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Hecho' }))
  fireEvent.click(screen.getByText('Guardar compra'))
  await waitFor(() => expect(closePurchase).toHaveBeenCalled())
  const body = vi.mocked(closePurchase).mock.calls.at(-1)![2]
  expect(body.lines[0]).toMatchObject({
    name: 'Contramuslo deshuesado',
    article: '01234',
  })
})

test('«Escribir a mano» opens the line’s editor', async () => {
  vi.mocked(getLabel).mockResolvedValue(null)
  renderSheet([item({ id: 'a', name: 'Contramuslo', quantity: '1' })])
  fireEvent.click(chip('Contramuslo')!)
  fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Escribir a mano' }),
  )
  expect(screen.getByDisplayValue('Contramuslo')).toBeInTheDocument()
})

test('offline, the chip refuses with the offline toast', () => {
  renderSheet([item({ id: 'a', name: 'Contramuslo', quantity: '1' })])
  reportRequestOutcome(false)
  fireEvent.click(chip('Contramuslo')!)
  expect(showToast).toHaveBeenCalledWith('Sin conexión')
  expect(
    screen.queryByRole('button', { name: 'leer etiqueta' }),
  ).not.toBeInTheDocument()
})
