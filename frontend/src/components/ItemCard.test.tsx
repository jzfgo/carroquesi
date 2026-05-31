import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { ItemCard } from './ItemCard'
import type { ListItem, Member } from '../types'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'user-1', displayName: 'Ana', photoUrl: null, email: 'ana@example.com' },
    getToken: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  }),
}))

const MEMBERS: Map<string, Member> = new Map([
  ['user-1', { id: 'user-1', displayName: 'Ana', initial: 'A', colour: '#7c3aed', photoUrl: null }],
])

const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1',
  name: 'Leche Entera', quantity: '2 unidades',
  brand: 'Hacendado', stores: ['Mercadona'],
  purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null,
  added_by: 'user-1', created_at: '', updated_at: '',
}

test('renders item name', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText('Leche Entera')).toBeInTheDocument()
})

test('renders quantity badge', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText('2 unidades')).toBeInTheDocument()
})

test('renders brand and store tags', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText(/Hacendado/)).toBeInTheDocument()
  expect(screen.getByText(/Mercadona/)).toBeInTheDocument()
})

test('shows CTA tags for null fields', () => {
  const item = { ...BASE_ITEM, brand: null, stores: [] }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByRole('button', { name: /añadir marca/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /añadir tienda/i })).toBeInTheDocument()
})

test('tag row is always present because CTAs are shown for null fields', () => {
  const item = { ...BASE_ITEM, brand: null, stores: [] }
  const { container } = render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  // CTA tags ARE shown for null fields — tag row is only hidden if we choose not to show CTAs
  // Per spec: CTA tags shown for missing fields, row omitted only when all null AND no CTAs desired
  // In our design: CTAs always shown for missing fields, so row is always present
  expect(container.querySelector('.item-card__tags')).toBeInTheDocument()
})

test('purchased state applies strikethrough class', () => {
  const item = { ...BASE_ITEM, purchased: true }
  const { container } = render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(container.querySelector('.item-card--purchased')).toBeInTheDocument()
})

test('tapping checkbox calls onTogglePurchased', () => {
  const handler = vi.fn()
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={handler} onTagClick={() => {}} onMenuOpen={() => {}} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(handler).toHaveBeenCalledWith('i1')
})

test('tapping a CTA tag calls onTagClick with item id and field', () => {
  const handler = vi.fn()
  const item = { ...BASE_ITEM, brand: null }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} onMenuOpen={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir marca/i }))
  expect(handler).toHaveBeenCalledWith('i1', 'brand')
})

test('tapping a filled tag button calls onTagClick with item id and field', () => {
  const handler = vi.fn()
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} onMenuOpen={() => {}} />)
  // BASE_ITEM has brand: 'Hacendado'
  fireEvent.click(screen.getByText(/Hacendado/))
  expect(handler).toHaveBeenCalledWith('i1', 'brand')
})

test('quantity is a button that calls onTagClick with quantity field', () => {
  const handler = vi.fn()
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} onMenuOpen={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /2 unidades/i }))
  expect(handler).toHaveBeenCalledWith('i1', 'quantity')
})

test('shows Add quantity CTA button when quantity is null', () => {
  const handler = vi.fn()
  const item = { ...BASE_ITEM, quantity: null }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} onMenuOpen={() => {}} />)
  const btn = screen.getByRole('button', { name: /añadir cantidad/i })
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(handler).toHaveBeenCalledWith('i1', 'quantity')
})

test('shows member initial in avatar when no photo', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText('A')).toBeInTheDocument()
})

test('shows member photo in avatar when photoUrl is set', () => {
  const membersWithPhoto = new Map([
    ['user-1', { id: 'user-1', displayName: 'Ana', initial: 'A', colour: '#7c3aed', photoUrl: 'https://example.com/ana.jpg' }],
  ])
  render(<ItemCard item={BASE_ITEM} members={membersWithPhoto} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  const img = screen.getByAltText('Ana')
  expect(img).toHaveAttribute('src', 'https://example.com/ana.jpg')
})

test('⋯ button calls onMenuOpen with item id', () => {
  const handler = vi.fn()
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={handler} />)
  fireEvent.click(screen.getByRole('button', { name: /opciones del producto/i }))
  expect(handler).toHaveBeenCalledWith('i1')
})

test('shows ? avatar for unknown member', () => {
  const item = { ...BASE_ITEM, added_by: 'unknown-uuid' }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText('?')).toBeInTheDocument()
})

test('renders multiple store chips when item has multiple stores', () => {
  const item = { ...BASE_ITEM, stores: ['Mercadona', 'Carrefour'] }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText(/Mercadona/)).toBeInTheDocument()
  expect(screen.getByText(/Carrefour/)).toBeInTheDocument()
})

test('tapping a store chip calls onTagClick with stores field', () => {
  const handler = vi.fn()
  const item = { ...BASE_ITEM, stores: ['Mercadona'] }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} onMenuOpen={() => {}} />)
  fireEvent.click(screen.getByText(/Mercadona/))
  expect(handler).toHaveBeenCalledWith('i1', 'stores')
})

test('renders "Volver a comprar" tag button when item is purchased and onClone is provided', () => {
  const onClone = vi.fn()
  const item = { ...BASE_ITEM, purchased: true }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} onClone={onClone} />)
  expect(screen.getByRole('button', { name: /volver a comprar/i })).toBeInTheDocument()
})

test('clicking "Volver a comprar" calls onClone with item id', () => {
  const onClone = vi.fn()
  const item = { ...BASE_ITEM, purchased: true }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} onClone={onClone} />)
  fireEvent.click(screen.getByRole('button', { name: /volver a comprar/i }))
  expect(onClone).toHaveBeenCalledWith('i1')
})

test('does not render "Volver a comprar" when item is not purchased', () => {
  const onClone = vi.fn()
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} onClone={onClone} />)
  expect(screen.queryByRole('button', { name: /volver a comprar/i })).not.toBeInTheDocument()
})

test('shows purchased_quantity chip instead of quantity when purchased', () => {
  const item = {
    ...BASE_ITEM,
    purchased: true,
    purchased_at: '2026-05-31T10:00:00',
    quantity: '2',
    purchased_quantity: '487g',
  }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText('487g')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

test('shows planned quantity as fallback when purchased but no purchased_quantity', () => {
  const item = {
    ...BASE_ITEM,
    purchased: true,
    purchased_at: '2026-05-31T10:00:00',
    quantity: '3',
    purchased_quantity: null,
  }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText('3')).toBeInTheDocument()
})
