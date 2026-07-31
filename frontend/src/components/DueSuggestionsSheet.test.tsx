import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { DueSuggestion } from '../types'
import { DueSuggestionsSheet } from './DueSuggestionsSheet'

const makeSuggestion = (
  name: string,
  overrides: Partial<DueSuggestion> = {},
): DueSuggestion => ({
  name,
  brand: 'Dodot',
  stores: ['Mercadona'],
  days_overdue: 1,
  dismissal_ttl_days: 5,
  median_interval_days: 7,
  days_since_last: 8,
  avg_quantity: null,
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
  render(
    <DueSuggestionsSheet
      suggestions={[]}
      onAdd={vi.fn()}
      onDismiss={vi.fn()}
      onClose={onClose}
    />,
  )
  expect(onClose).toHaveBeenCalled()
})

test('clicking overlay calls onClose', () => {
  const { container } = render(<DueSuggestionsSheet {...baseProps} />)
  fireEvent.click(container.querySelector('.due-suggestions-sheet__overlay')!)
  expect(baseProps.onClose).toHaveBeenCalled()
})


describe('DueSuggestionsSheet — with no connection', () => {
  test('does not offer to add a suggestion', () => {
    const onAdd = vi.fn()
    render(<DueSuggestionsSheet {...baseProps} isOffline onAdd={onAdd} />)
    const add = screen.getAllByRole('button', { name: /añadir/i })[0]
    expect(add).toBeDisabled()
    fireEvent.click(add)
    expect(onAdd).not.toHaveBeenCalled()
  })

  // Dismissing is written to this device, not to the server, so it is not a
  // write and must keep working — the list can still be tidied in the aisle.
  test('still lets a suggestion be dismissed', () => {
    const onDismiss = vi.fn()
    render(
      <DueSuggestionsSheet {...baseProps} isOffline onDismiss={onDismiss} />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /ignorar/i })[0])
    expect(onDismiss).toHaveBeenCalled()
  })
})
