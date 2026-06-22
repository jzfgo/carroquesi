import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toast } from './Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('renders message', () => {
  render(<Toast message="Could not update item" onDismiss={() => { }} />)
  expect(screen.getByText('Could not update item')).toBeInTheDocument()
})

test('calls onDismiss after 3 seconds', () => {
  const dismiss = vi.fn()
  render(<Toast message="Error" onDismiss={dismiss} />)
  expect(dismiss).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(dismiss).toHaveBeenCalledTimes(1)
})

test('does not call onDismiss before 3 seconds', () => {
  const dismiss = vi.fn()
  render(<Toast message="Error" onDismiss={dismiss} />)
  act(() => {
    vi.advanceTimersByTime(2999)
  })
  expect(dismiss).not.toHaveBeenCalled()
})
