import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { FrequencySuggestionBanner } from './FrequencySuggestionBanner'
import type { DueSuggestion } from '../types'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const suggestions: DueSuggestion[] = [
  { name: 'Bananas', brand: null, stores: [], days_overdue: 1, dismissal_ttl_days: 3 },
  { name: 'Milk', brand: 'Pascual', stores: ['Mercadona'], days_overdue: 0.5, dismissal_ttl_days: 2 },
]

test('renders first suggestion', () => {
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={vi.fn()} />)
  expect(screen.getByText('Bananas')).toBeInTheDocument()
})

test('renders nothing when suggestions is empty', () => {
  const { container } = render(<FrequencySuggestionBanner suggestions={[]} onAdd={vi.fn()} />)
  expect(container.firstChild).toBeNull()
})

test('cycles to next suggestion after 6 seconds', () => {
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={vi.fn()} />)
  expect(screen.getByText('Bananas')).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(6000) })
  expect(screen.getByText('Milk')).toBeInTheDocument()
})

test('dismiss hides current suggestion and shows next', async () => {
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={vi.fn()} />)
  await userEvent.click(screen.getByLabelText('Ignorar'))
  expect(screen.queryByText('Bananas')).not.toBeInTheDocument()
  expect(screen.getByText('Milk')).toBeInTheDocument()
})

test('add calls onAdd with the suggestion', async () => {
  const onAdd = vi.fn()
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={onAdd} />)
  await userEvent.click(screen.getByText('+ Añadir'))
  expect(onAdd).toHaveBeenCalledWith(suggestions[0])
})

test('shows brand and stores as secondary text', () => {
  render(<FrequencySuggestionBanner suggestions={[suggestions[1]]} onAdd={vi.fn()} />)
  expect(screen.getByText('Pascual · Mercadona')).toBeInTheDocument()
})

test('hides banner when last suggestion is dismissed', async () => {
  const single = [suggestions[0]]
  const { container } = render(<FrequencySuggestionBanner suggestions={single} onAdd={vi.fn()} />)
  await userEvent.click(screen.getByLabelText('Ignorar'))
  expect(container.firstChild).toBeNull()
})
