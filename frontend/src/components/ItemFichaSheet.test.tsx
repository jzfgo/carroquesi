import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { getPriceHistory } from '../lib/api'
import type { ListItem, Member, PriceHistoryResponse } from '../types'
import { ItemFichaSheet } from './ItemFichaSheet'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    getPriceHistory: vi.fn(() => Promise.resolve({ entries: [] })),
  }
})

const history: PriceHistoryResponse = {
  entries: [
    {
      amount: 0.89,
      is_sin_precio: false,
      price_per: null,
      purchased_at: '2026-07-22T10:00:00Z',
      quantity: '6 ud',
      store: 'Mercadona',
    },
  ],
}

const item: ListItem = {
  id: 'i1',
  list_id: 'l1',
  name: 'Leche entera',
  quantity: '6 ud',
  purchased_quantity: null,
  brand: 'Puleva',
  stores: ['Mercadona'],
  purchased: false,
  purchased_at: null,
  ean: '8410188012374',
  price: 0.89,
  price_per: null,
  price_store: 'Mercadona',
  added_by: 'u1',
  created_at: '2026-07-18T09:00:00Z',
  updated_at: '2026-07-18T09:00:00Z',
}

const members = new Map<string, Member>([
  [
    'u1',
    {
      id: 'u1',
      displayName: 'Marta',
      initial: 'M',
      color: '#000',
      photoUrl: null,
    },
  ],
])

function renderSheet(
  over: Partial<ListItem> = {},
  props: Record<string, unknown> = {},
) {
  const handlers = {
    onRename: vi.fn(),
    onEditField: vi.fn(),
    onDelete: vi.fn(),
    onClone: vi.fn(),
    onClose: vi.fn(),
  }
  render(
    <ItemFichaSheet
      item={{ ...item, ...over }}
      members={members}
      displayStore={(raw) => raw}
      getToken={vi.fn(() => Promise.resolve('t'))}
      listId="l1"
      purchased={over.purchased}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPriceHistory).mockResolvedValue({ entries: [] })
})

test('renders the four blocks: último precio, price history, producto fields, and rastro', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce(history)
  renderSheet()

  // Block 1 + the header (the dialog is named for the product).
  expect(screen.getByText('Último precio')).toBeInTheDocument()
  expect(
    screen.getByRole('dialog', { name: 'Leche entera' }),
  ).toBeInTheDocument()

  // Block 2 arrives after the history fetch resolves.
  await waitFor(() => expect(screen.getByText(/1 precio/)).toBeInTheDocument())

  // Block 3 — every product field label.
  expect(screen.getByText('Producto')).toBeInTheDocument()
  for (const label of ['Nombre', 'Marca', 'Cantidad', 'Tiendas', 'Código']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  expect(screen.getByText('8410188012374')).toBeInTheDocument()

  // Block 4. The adder's name comes back emphasised, so it sits in its own
  // node — assert the surrounding text and the bold name separately.
  expect(screen.getByText('Rastro')).toBeInTheDocument()
  expect(screen.getByText(/Lo añadió/)).toBeInTheDocument()
  expect(screen.getByText('Marta').tagName).toBe('B')
})

test('the EAN field is read-only — no chevron, no editor', () => {
  renderSheet()
  const code = screen.getByText('8410188012374')
  expect(code.closest('button')).toBeNull()
})

test('the Nombre field opens the rename editor in place and steps back', () => {
  renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  expect(
    screen.getByRole('textbox', { name: 'Nombre del producto' }),
  ).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(
    screen.queryByRole('textbox', { name: 'Nombre del producto' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /nombre/i })).toBeInTheDocument()
})

test('renaming calls onRename with the trimmed value', () => {
  const { onRename } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Nombre del producto' }),
    {
      target: { value: '  Leche desnatada  ' },
    },
  )
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(onRename).toHaveBeenCalledWith('Leche desnatada')
})

test('Marca, Cantidad and Tiendas open their existing per-field editors', () => {
  const { onEditField } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /marca/i }))
  expect(onEditField).toHaveBeenCalledWith('brand')
  fireEvent.click(screen.getByRole('button', { name: /cantidad/i }))
  expect(onEditField).toHaveBeenCalledWith('quantity')
  fireEvent.click(screen.getByRole('button', { name: /tiendas/i }))
  expect(onEditField).toHaveBeenCalledWith('stores')
})

test('a purchased record renders its fields read-only', () => {
  renderSheet({ purchased: true })
  // None of the editable fields is a button any more.
  expect(screen.getByText('Nombre').closest('button')).toBeNull()
  expect(screen.getByText('Marca').closest('button')).toBeNull()
  expect(screen.getByText('Tiendas').closest('button')).toBeNull()
})

test('the footer clone action calls onClone on a purchased record', () => {
  const { onClone } = renderSheet({ purchased: true })
  fireEvent.click(screen.getByRole('button', { name: /volver a comprar/i }))
  expect(onClone).toHaveBeenCalled()
})

test('«Volver a comprar» is hidden on a pending item', () => {
  renderSheet({ purchased: false })
  expect(
    screen.queryByRole('button', { name: /volver a comprar/i }),
  ).not.toBeInTheDocument()
})

test('deleting confirms in a sub-state before calling onDelete', () => {
  const { onDelete } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
  expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
  expect(onDelete).toHaveBeenCalled()
})
