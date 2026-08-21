import { act, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { useSwipeToDismissRow } from './useSwipeToDismissRow'

// A tiny harness component: the hook wants a real element to receive the
// pointer events (it reads currentTarget), so renderHook alone won't do.
function Row({ onDismiss }: { onDismiss: () => void }) {
  const { handlers, style, dismissing } = useSwipeToDismissRow(onDismiss)
  return createElement('div', {
    'data-testid': 'row',
    'data-dismissing': dismissing,
    style,
    ...handlers,
  })
}

function pointer(el: Element, type: string, x: number, y: number) {
  fireEvent(
    el,
    new PointerEvent(type, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    }),
  )
}

test('a past-threshold horizontal swipe commits and calls onDismiss', () => {
  const onDismiss = vi.fn()
  const { getByTestId } = render(createElement(Row, { onDismiss }))
  const row = getByTestId('row')

  act(() => {
    pointer(row, 'pointerdown', 200, 100)
    pointer(row, 'pointermove', 90, 102) // dx -110, dominantly horizontal
    pointer(row, 'pointerup', 90, 102)
  })

  // Committed: row is marked dismissing and slides fully off-screen. onDismiss
  // fires once the slide-out transition ends.
  expect(row.dataset.dismissing).toBe('true')
  expect(row.style.transform).toBe('translateX(-100%)')
  expect(onDismiss).not.toHaveBeenCalled()

  fireEvent.transitionEnd(row)
  expect(onDismiss).toHaveBeenCalledTimes(1)
})

test('a short horizontal swipe snaps back without dismissing', () => {
  const onDismiss = vi.fn()
  const { getByTestId } = render(createElement(Row, { onDismiss }))
  const row = getByTestId('row')

  act(() => {
    pointer(row, 'pointerdown', 200, 100)
    pointer(row, 'pointermove', 170, 100) // dx -30, below the 96px fallback
    pointer(row, 'pointerup', 170, 100)
  })

  expect(row.dataset.dismissing).toBe('false')
  expect(row.style.transform).toBe('')
  expect(onDismiss).not.toHaveBeenCalled()
})

test('a dominantly vertical move never dismisses (list keeps scrolling)', () => {
  const onDismiss = vi.fn()
  const { getByTestId } = render(createElement(Row, { onDismiss }))
  const row = getByTestId('row')

  act(() => {
    pointer(row, 'pointerdown', 200, 100)
    pointer(row, 'pointermove', 210, 200) // dy 100 >> dx 10 -> vertical lock
    pointer(row, 'pointerup', 210, 260)
  })

  expect(row.dataset.dismissing).toBe('false')
  // Never entered the drag phase, so no inline transform was written.
  expect(row.style.transform).toBe('')
  expect(onDismiss).not.toHaveBeenCalled()
})

test('a completed swipe suppresses the trailing click (no accidental accept)', () => {
  const onDismiss = vi.fn()
  const onClick = vi.fn()
  function ClickableRow() {
    const { handlers, style } = useSwipeToDismissRow(onDismiss)
    return createElement('div', {
      'data-testid': 'row',
      style,
      onClick,
      ...handlers,
    })
  }
  const { getByTestId } = render(createElement(ClickableRow))
  const row = getByTestId('row')

  act(() => {
    pointer(row, 'pointerdown', 200, 100)
    pointer(row, 'pointermove', 90, 102)
    pointer(row, 'pointerup', 90, 102)
  })
  fireEvent.click(row)

  expect(onClick).not.toHaveBeenCalled()
})
