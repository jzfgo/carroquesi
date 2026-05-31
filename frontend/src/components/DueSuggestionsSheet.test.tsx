import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { DueSuggestionsSheet } from './DueSuggestionsSheet'
import type { DueSuggestion } from '../types'

const makeSuggestion = (name: string, overrides: Partial<DueSuggestion> = {}): DueSuggestion => ({
  name,
  brand: 'Dodot',
  stores: ['Mercadona'],
  days_overdue: 1,
  dismissal_ttl_days: 5,
  median_interval_days: 7,
  days_since_last: 8,
  ...overrides,
})

const baseProps = {
  suggestions: [makeSuggestion('Pañales'), makeSuggestion('Leche')],
  onAdd: vi.fn(),
  onDismiss: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

test('renders all suggestion names', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  expect(screen.getByText('Pañales')).toBeInTheDocument()
  expect(screen.getByText('Leche')).toBeInTheDocument()
})

test('renders frequency chip', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  // median_interval_days=7 → 'cada semana'
  expect(screen.getAllByText('cada semana').length).toBeGreaterThan(0)
})

test('renders recency chip', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  // days_since_last=8 → 'hace 8 días'
  expect(screen.getAllByText('hace 8 días').length).toBeGreaterThan(0)
})

test('clicking + Añadir calls onAdd with the suggestion', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  fireEvent.click(screen.getAllByRole('button', { name: /añadir/i })[0])
  expect(baseProps.onAdd).toHaveBeenCalledWith(baseProps.suggestions[0])
})

test('clicking ✕ calls onDismiss with the suggestion', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  fireEvent.click(screen.getAllByRole('button', { name: /ignorar/i })[0])
  expect(baseProps.onDismiss).toHaveBeenCalledWith(baseProps.suggestions[0])
})

test('calls onClose when suggestions list is empty', () => {
  const onClose = vi.fn()
  render(<DueSuggestionsSheet suggestions={[]} onAdd={vi.fn()} onDismiss={vi.fn()} onClose={onClose} />)
  expect(onClose).toHaveBeenCalled()
})

test('clicking overlay calls onClose', () => {
  const { container } = render(<DueSuggestionsSheet {...baseProps} />)
  fireEvent.click(container.querySelector('.due-suggestions-sheet__overlay')!)
  expect(baseProps.onClose).toHaveBeenCalled()
})
