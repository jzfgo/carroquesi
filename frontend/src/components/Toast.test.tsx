import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toast } from './Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('renders message', () => {
  render(<Toast message="Could not update item" onDismiss={() => {}} />)
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

test('renders the strong tail and the single CTA', () => {
  const onAction = vi.fn()
  render(
    <Toast
      message="Añadido"
      strong="Ekologisk havredryck"
      action={{ label: 'Ajustar', onClick: onAction }}
      onDismiss={() => {}}
    />,
  )
  const strong = screen.getByText('Ekologisk havredryck')
  expect(strong.tagName).toBe('STRONG')
  fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }))
  expect(onAction).toHaveBeenCalledTimes(1)
})

test('renders no CTA without an action', () => {
  render(<Toast message="Sin conexión" onDismiss={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Ajustar' })).toBeNull()
})
