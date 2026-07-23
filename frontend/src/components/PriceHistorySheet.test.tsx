import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { getPriceHistory } from '../lib/api'
import type { ListItem, PriceHistoryResponse } from '../types'
import PriceHistorySheet from './PriceHistorySheet'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    getPriceHistory: vi.fn(),
  }
})

const mockItem: ListItem = {
  id: 'item-123',
  list_id: 'list-456',
  name: 'Leche Desnatada',
  quantity: '1',
  purchased_quantity: null,
  brand: 'Hacendado',
  stores: ['Mercadona'],
  purchased: false,
  purchased_at: null,
  ean: null,
  price: 0.85,
  price_per: 'UNIT',
  price_store: 'Mercadona',
  added_by: 'user-123',
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
}

const mockGetToken = vi.fn().mockResolvedValue('test-token')
const mockOnLogPrice = vi.fn()
const mockOnClose = vi.fn()

const baseProps = {
  item: mockItem,
  listId: 'list-456',
  getToken: mockGetToken,
  onLogPrice: mockOnLogPrice,
  onClose: mockOnClose,
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('renders item name as title and fetches price history', async () => {
  const mockResponse: PriceHistoryResponse = {
    entries: [
      {
        amount: 0.85,
        price_per: 'UNIT',
        store: 'Mercadona',
        purchased_at: '2026-07-20T12:00:00Z',
        quantity: '1',
      },
    ],
    community_price: 0.89,
    community_price_per: 'UNIT',
  }

  vi.mocked(getPriceHistory).mockResolvedValueOnce(mockResponse)

  render(<PriceHistorySheet {...baseProps} />)

  expect(screen.getByText('Leche Desnatada')).toBeInTheDocument()

  await waitFor(() => {
    expect(getPriceHistory).toHaveBeenCalledWith(
      expect.any(Function),
      'list-456',
      'item-123',
      'this_list',
    )
  })

  expect(screen.getByText(/0,89|0\.89/)).toBeInTheDocument()
  expect(screen.getByText('Mercadona')).toBeInTheDocument()
  expect(screen.getByText(/1 precio/)).toBeInTheDocument()
  expect(screen.getByText(/0,85|0\.85/)).toBeInTheDocument()
})

test('renders empty state when there are no prices', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce({
    entries: [],
    community_price: null,
    community_price_per: null,
  })

  render(<PriceHistorySheet {...baseProps} />)

  await waitFor(() => {
    expect(screen.getByText('No hay precios registrados.')).toBeInTheDocument()
  })
})

test('switches scope and refetches history', async () => {
  vi.mocked(getPriceHistory).mockResolvedValue({
    entries: [],
    community_price: null,
    community_price_per: null,
  })

  render(<PriceHistorySheet {...baseProps} />)

  await waitFor(() => {
    expect(getPriceHistory).toHaveBeenCalledTimes(1)
  })

  fireEvent.click(screen.getByText('Mis listas'))

  await waitFor(() => {
    expect(getPriceHistory).toHaveBeenLastCalledWith(
      expect.any(Function),
      'list-456',
      'item-123',
      'my_lists',
    )
  })

  fireEvent.click(screen.getByText('Todos'))

  await waitFor(() => {
    expect(getPriceHistory).toHaveBeenLastCalledWith(
      expect.any(Function),
      'list-456',
      'item-123',
      'all',
    )
  })
})

test('clicking a store row expands it to show detailed stats and records', async () => {
  const mockResponse: PriceHistoryResponse = {
    entries: [
      {
        amount: 0.85,
        price_per: 'UNIT',
        store: 'Mercadona',
        purchased_at: '2026-07-20T12:00:00Z',
        quantity: '1',
      },
      {
        amount: 0.89,
        price_per: 'UNIT',
        store: 'Mercadona',
        purchased_at: '2026-07-15T12:00:00Z',
        quantity: '1',
      },
    ],
    community_price: null,
    community_price_per: null,
  }

  vi.mocked(getPriceHistory).mockResolvedValueOnce(mockResponse)

  render(<PriceHistorySheet {...baseProps} />)

  await waitFor(() => {
    expect(screen.getByText('Mercadona')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Mercadona'))

  expect(screen.getByText('Mínimo')).toBeInTheDocument()
  expect(screen.getByText('Máximo')).toBeInTheDocument()
  expect(screen.getByText('Último')).toBeInTheDocument()

  expect(screen.getByText('20 jul')).toBeInTheDocument()
  expect(screen.getByText('15 jul')).toBeInTheDocument()
})

test('calls onLogPrice when log price button is clicked', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce({
    entries: [],
    community_price: null,
    community_price_per: null,
  })

  // Render with an item with no price so "+ Registrar precio" button is displayed
  const itemNoPrice = { ...mockItem, price: null }
  render(<PriceHistorySheet {...baseProps} item={itemNoPrice} />)

  await waitFor(() => {
    expect(screen.getByText('+ Registrar precio')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ Registrar precio'))
  expect(mockOnLogPrice).toHaveBeenCalled()
})

test('hides log price button when readOnly is true', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce({
    entries: [],
    community_price: null,
    community_price_per: null,
  })

  render(<PriceHistorySheet {...baseProps} readOnly={true} />)

  await waitFor(() => {
    expect(screen.queryByText('+ Registrar precio')).not.toBeInTheDocument()
    expect(screen.queryByText(/Actualizar precio/)).not.toBeInTheDocument()
  })
})
