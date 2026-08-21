import { fireEvent, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { DueSuggestion } from '../types'
import { SuggestionRow } from './SuggestionRow'

const base: DueSuggestion = {
  name: 'Leche entera',
  brand: null,
  stores: ['Mercadona'],
  avg_quantity: 6,
  median_interval_days: 7,
  days_since_last: 9,
  days_overdue: 2,
  dismissal_ttl_days: 30,
}

test('renders the name and the fused frequency · recency meta line', () => {
  const { getByText } = render(
    <SuggestionRow suggestion={base} onAdd={vi.fn()} onDismiss={vi.fn()} />,
  )
  getByText('Leche entera')
  // Fused from formatFrequency(7) + formatLastPurchase(9); CSS uppercases it.
  getByText('cada semana · la última hace 9 días')
})

test('tapping the row accepts the suggestion', () => {
  const onAdd = vi.fn()
  const { getByRole } = render(
    <SuggestionRow suggestion={base} onAdd={onAdd} onDismiss={vi.fn()} />,
  )
  fireEvent.click(getByRole('button', { name: 'Añadir Leche entera' }))
  expect(onAdd).toHaveBeenCalledWith(base)
})

test('the hidden dismiss button dismisses the suggestion', () => {
  const onDismiss = vi.fn()
  const { getByRole } = render(
    <SuggestionRow suggestion={base} onAdd={vi.fn()} onDismiss={onDismiss} />,
  )
  fireEvent.click(getByRole('button', { name: 'Descartar sugerencia' }))
  expect(onDismiss).toHaveBeenCalledWith(base)
})
