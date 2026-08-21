import { renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useSwipeToDismiss } from './useSwipeToDismiss'

function touchEvent(clientY: number, target?: EventTarget) {
  return {
    touches: [{ clientY }],
    changedTouches: [{ clientY }],
    target,
  } as unknown as React.TouchEvent
}

/** A sheet panel with a scrollable body and a touch target inside it. */
function sheetWithScrollableBody(scrollTop: number) {
  const panel = document.createElement('div')
  const body = document.createElement('div')
  const target = document.createElement('button')
  body.appendChild(target)
  panel.appendChild(body)
  Object.defineProperty(body, 'scrollTop', { value: scrollTop, writable: true })
  return { panel, body, target }
}

test('useSwipeToDismiss updates transform and transition styles on swipe', () => {
  const onClose = vi.fn()
  const mockElement = {
    style: {
      transition: '',
      transform: '',
    },
  } as unknown as HTMLElement

  const ref = { current: mockElement }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))

  const handlers = result.current

  // 1. TouchStart, then TouchMove dragging down by 50px
  handlers.onTouchStart(touchEvent(100))
  handlers.onTouchMove(touchEvent(150))

  // The transition is disabled when the drag begins, so the panel tracks
  // the finger.
  expect(mockElement.style.transition).toBe('none')
  expect(mockElement.style.transform).toBe('translateY(50px)')

  // 2. TouchEnd (released at 150px, dy = 50 < threshold 80) -> rides back up
  handlers.onTouchEnd(touchEvent(150))

  // A cleared transform, restored under the entrance spring so it animates back.
  expect(mockElement.style.transition).toBe(
    'transform var(--dur-slow) var(--ease-spring)',
  )
  expect(mockElement.style.transform).toBe('')
  expect(onClose).not.toHaveBeenCalled()

  // 3. Drag again, past the threshold this time -> triggers onClose
  handlers.onTouchStart(touchEvent(100))
  handlers.onTouchMove(touchEvent(200))
  expect(mockElement.style.transform).toBe('translateY(100px)')

  handlers.onTouchEnd(touchEvent(200))

  expect(mockElement.style.transition).toBe('')
  expect(onClose).toHaveBeenCalled()
})

test('useSwipeToDismiss does not translate if clientY is less than startY (swiping up)', () => {
  const onClose = vi.fn()
  const mockElement = {
    style: {
      transition: '',
      transform: '',
    },
  } as unknown as HTMLElement

  const ref = { current: mockElement }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))
  const handlers = result.current

  handlers.onTouchStart(touchEvent(100))
  handlers.onTouchMove(touchEvent(50))

  expect(mockElement.style.transform).toBe('')
})

test('a tap with no drag leaves the panel styles alone', () => {
  const onClose = vi.fn()
  const mockElement = {
    style: {
      transition: '',
      transform: '',
    },
  } as unknown as HTMLElement

  const ref = { current: mockElement }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))
  const handlers = result.current

  handlers.onTouchStart(touchEvent(100))
  handlers.onTouchEnd(touchEvent(100))

  expect(mockElement.style.transition).toBe('')
  expect(mockElement.style.transform).toBe('')
  expect(onClose).not.toHaveBeenCalled()
})

test('a drag over scrolled-down content is a scroll, not a dismiss', () => {
  const onClose = vi.fn()
  const { panel, target } = sheetWithScrollableBody(120)
  const ref = { current: panel }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))
  const handlers = result.current

  handlers.onTouchStart(touchEvent(100, target))
  handlers.onTouchMove(touchEvent(300, target))
  handlers.onTouchEnd(touchEvent(300, target))

  expect(panel.style.transform).toBe('')
  expect(onClose).not.toHaveBeenCalled()
})

test('a drag captures the sheet once the content reaches its top mid-gesture', () => {
  const onClose = vi.fn()
  const { panel, body, target } = sheetWithScrollableBody(40)
  const ref = { current: panel }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))
  const handlers = result.current

  handlers.onTouchStart(touchEvent(100, target))
  // Still scrolled: the move re-anchors instead of translating.
  handlers.onTouchMove(touchEvent(140, target))
  expect(panel.style.transform).toBe('')

  // The content hits its top; from here the drag owns the sheet, measured
  // from the re-anchored point (140), not the original touch (100).
  body.scrollTop = 0
  handlers.onTouchMove(touchEvent(200, target))
  expect(panel.style.transform).toBe('translateY(60px)')

  handlers.onTouchEnd(touchEvent(260, target))
  expect(onClose).toHaveBeenCalled()
})

test('a drag from content sitting at its top dismisses the sheet', () => {
  const onClose = vi.fn()
  const { panel, target } = sheetWithScrollableBody(0)
  const ref = { current: panel }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))
  const handlers = result.current

  handlers.onTouchStart(touchEvent(100, target))
  handlers.onTouchMove(touchEvent(250, target))
  expect(panel.style.transform).toBe('translateY(150px)')

  handlers.onTouchEnd(touchEvent(250, target))
  expect(onClose).toHaveBeenCalled()
})

test('useSwipeToDismiss handles missing sheet ref gracefully', () => {
  const onClose = vi.fn()
  const ref = { current: null }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))
  const handlers = result.current

  handlers.onTouchStart(touchEvent(100))
  handlers.onTouchMove(touchEvent(150))
  handlers.onTouchEnd(touchEvent(150))

  expect(onClose).not.toHaveBeenCalled()
})
