import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toast, type ToastAction } from './Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const undo = (onAct = () => {}): ToastAction => ({
  label: 'Deshacer',
  tone: 'verde',
  onAct,
})

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

test('renders the action and fires it', () => {
  const onAct = vi.fn()
  render(
    <Toast
      message="En el carro, pan"
      action={undo(onAct)}
      onDismiss={vi.fn()}
    />,
  )
  screen.getByRole('button', { name: 'Deshacer' }).click()
  expect(onAct).toHaveBeenCalledTimes(1)
})

// Each notice carries the control that closes it. A notice left up after its
// action was taken also sits on top of whatever that action just opened.
test('taking the action closes the notice', () => {
  const dismiss = vi.fn()
  render(
    <Toast
      message="3 cambios no se pudieron enviar"
      action={{ label: 'Ver cuáles', tone: 'miel', onAct: vi.fn() }}
      onDismiss={dismiss}
    />,
  )
  screen.getByRole('button', { name: 'Ver cuáles' }).click()
  expect(dismiss).toHaveBeenCalledTimes(1)
})

// Three seconds is enough to read a notice and short for a decision.
test('a notice carrying an action lasts twice as long', () => {
  const dismiss = vi.fn()
  render(
    <Toast message="En el carro, pan" action={undo()} onDismiss={dismiss} />,
  )
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(dismiss).not.toHaveBeenCalled()
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  expect(dismiss).toHaveBeenCalledTimes(1)
})

/**
 * The bar *is* the window, so it drains for exactly as long as the timer runs.
 * Two encodings of one duration drift apart, and this one drifts invisibly:
 * the bar is three pixels tall, so a screenshot's tolerance would swallow the
 * difference and the undo would appear to have run out while it had not.
 */
test('the bar drains for exactly as long as the window lasts', () => {
  const { container, rerender } = render(
    <Toast message="Guardado" onDismiss={vi.fn()} />,
  )
  const fill = () =>
    container.querySelector<HTMLElement>('.toast__progress-fill')!

  expect(fill().style.animationDuration).toBe('3000ms')

  rerender(
    <Toast message="En el carro, pan" action={undo()} onDismiss={vi.fn()} />,
  )
  expect(fill().style.animationDuration).toBe('6000ms')
})

/**
 * role="alert" is an assertive live region and cannot hold a control anybody
 * can reliably reach. The message is the live region; the action is not in it.
 */
test('no live region wraps the action', () => {
  const { container } = render(
    <Toast message="En el carro, pan" action={undo()} onDismiss={vi.fn()} />,
  )
  expect(container.querySelector('[role="alert"]')).toBeNull()

  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('En el carro, pan')
  expect(
    status.querySelector('button'),
    'the action must sit outside the live region',
  ).toBeNull()
})

// Reaching for a control that vanishes under the finger is worse than having
// no control, and somebody tabbing to it is slower than somebody tapping it.
test('does not run out while focus is inside it', () => {
  const dismiss = vi.fn()
  render(
    <Toast message="En el carro, pan" action={undo()} onDismiss={dismiss} />,
  )

  act(() => {
    screen.getByRole('button', { name: 'Deshacer' }).focus()
  })
  act(() => {
    vi.advanceTimersByTime(20000)
  })
  expect(dismiss).not.toHaveBeenCalled()

  act(() => {
    screen.getByRole('button', { name: 'Deshacer' }).blur()
  })
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  expect(dismiss).toHaveBeenCalledTimes(1)
})

// The colour is the whole difference between the three notices, and it lives
// only in the bar — the body carries no border of its own.
test('the tone rides on the action', () => {
  const { container, rerender } = render(
    <Toast
      message="No se pudo guardar el precio"
      action={{ label: 'Reintentar', tone: 'tomate', onAct: vi.fn() }}
      onDismiss={vi.fn()}
    />,
  )
  expect(container.querySelector('.toast--tomate')).not.toBeNull()

  rerender(
    <Toast
      message="3 cambios no se pudieron enviar"
      action={{ label: 'Ver cuáles', tone: 'miel', onAct: vi.fn() }}
      onDismiss={vi.fn()}
    />,
  )
  expect(container.querySelector('.toast--miel')).not.toBeNull()
})
