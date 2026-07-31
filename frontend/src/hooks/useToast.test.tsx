import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Toast } from '../components/Toast'
import { useToast } from './useToast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/**
 * The harness is the point: `Toast` keys its window on the message, so the
 * defect only exists once a screen renders it the way the screens do — one
 * element, kept across showings.
 */
function Harness({ say }: { say: (show: (m: string) => void) => void }) {
  const { toast, showToast, dismissToast } = useToast()
  return (
    <>
      <button onClick={() => say(showToast)}>say</button>
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          onDismiss={dismissToast}
        />
      )}
    </>
  )
}

test('gives each showing its own identity', () => {
  const seen: number[] = []
  function Probe() {
    const { toast, showToast } = useToast()
    return (
      <>
        <button onClick={() => showToast('1 cambio no se pudo enviar')}>
          say
        </button>
        <span>{toast ? seen.push(toast.id) : null}</span>
      </>
    )
  }
  render(<Probe />)
  act(() => screen.getByRole('button', { name: 'say' }).click())
  act(() => screen.getByRole('button', { name: 'say' }).click())

  expect(new Set(seen).size).toBe(seen.length)
})

/**
 * A flapping connection failing the same way twice is two notices, not one
 * that never left. Without a key the second inherits whatever is left of the
 * first one's seconds — here, 500 ms — and a bar already most of the way down.
 */
test('the same words twice start a second window, not the rest of the first', () => {
  render(<Harness say={(show) => show('1 cambio no se pudo enviar')} />)

  act(() => screen.getByRole('button', { name: 'say' }).click())
  act(() => {
    vi.advanceTimersByTime(2500)
  })
  // The second failure, with half a second left on the first notice.
  act(() => screen.getByRole('button', { name: 'say' }).click())

  act(() => {
    vi.advanceTimersByTime(2999)
  })
  expect(
    screen.queryByText('1 cambio no se pudo enviar'),
    'the second notice got its own three seconds',
  ).toBeInTheDocument()

  act(() => {
    vi.advanceTimersByTime(2)
  })
  expect(screen.queryByText('1 cambio no se pudo enviar')).toBeNull()
})
