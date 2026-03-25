import { render, screen, fireEvent } from '@testing-library/react'
import { ItemList } from './ItemList'
import type { ListItem, Member } from '../types'

const MEMBERS: Map<string, Member> = new Map()

const makeItem = (id: string, purchased = false): ListItem => ({
  id, list_id: 'l1', name: `Item ${id}`, quantity: null,
  variety: null, brand: null, store: null,
  purchased, added_by: 'u1', created_at: '', updated_at: '',
})

test('shows loading skeleton', () => {
  const { container } = render(
    <ItemList status="loading" items={[]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(container.querySelector('.item-list__skeleton')).toBeInTheDocument()
})

test('shows error state with retry button', () => {
  const retry = vi.fn()
  render(
    <ItemList status="error" items={[]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={retry} />
  )
  expect(screen.getByText(/No se pudieron cargar los productos/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
  expect(retry).toHaveBeenCalledTimes(1)
})

test('shows empty state', () => {
  render(
    <ItemList status="success" items={[]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText(/Sin productos/i)).toBeInTheDocument()
})

test('renders active items section label', () => {
  const items = [makeItem('a'), makeItem('b')]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText('2 productos por comprar')).toBeInTheDocument()
})

test('section label reads "1 item left" for single item', () => {
  render(
    <ItemList status="success" items={[makeItem('a')]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText('1 producto por comprar')).toBeInTheDocument()
})

test('purchased section hidden when no items purchased', () => {
  render(
    <ItemList status="success" items={[makeItem('a')]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.queryByText('Comprados')).not.toBeInTheDocument()
})

test('purchased section shown when items purchased', () => {
  const items = [makeItem('a', false), makeItem('b', true)]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText('Comprados')).toBeInTheDocument()
})

test('purchased items appear below active items', () => {
  const items = [makeItem('a', true), makeItem('b', false)]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  const allItems = screen.getAllByText(/Item [ab]/)
  // Item b (active) should appear before Item a (purchased)
  expect(allItems[0].textContent).toContain('b')
  expect(allItems[1].textContent).toContain('a')
})
