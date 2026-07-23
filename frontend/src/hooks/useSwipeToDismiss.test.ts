import { renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useSwipeToDismiss } from './useSwipeToDismiss'

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

  // 1. TouchStart
  const startEvent = {
    touches: [{ clientY: 100 }],
  } as unknown as React.TouchEvent
  handlers.onTouchStart(startEvent)

  expect(mockElement.style.transition).toBe('none')

  // 2. TouchMove (dragging down by 50px)
  const moveEvent = {
    touches: [{ clientY: 150 }],
  } as unknown as React.TouchEvent
  handlers.onTouchMove(moveEvent)

  expect(mockElement.style.transform).toBe('translateY(50px)')

  // 3. TouchEnd (released at 150px, dy = 50 < threshold 80) -> snaps back
  const endEventSnap = {
    changedTouches: [{ clientY: 150 }],
  } as unknown as React.TouchEvent
  handlers.onTouchEnd(endEventSnap)

  expect(mockElement.style.transition).toBe('')
  expect(mockElement.style.transform).toBe('')
  expect(onClose).not.toHaveBeenCalled()

  // 4. TouchStart again
  handlers.onTouchStart(startEvent)
  expect(mockElement.style.transition).toBe('none')

  // 5. TouchMove (dragging down by 100px)
  const moveEventClose = {
    touches: [{ clientY: 200 }],
  } as unknown as React.TouchEvent
  handlers.onTouchMove(moveEventClose)
  expect(mockElement.style.transform).toBe('translateY(100px)')

  // 6. TouchEnd (released at 200px, dy = 100 > threshold 80) -> triggers onClose
  const endEventClose = {
    changedTouches: [{ clientY: 200 }],
  } as unknown as React.TouchEvent
  handlers.onTouchEnd(endEventClose)

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

  handlers.onTouchStart({
    touches: [{ clientY: 100 }],
  } as unknown as React.TouchEvent)

  handlers.onTouchMove({
    touches: [{ clientY: 50 }],
  } as unknown as React.TouchEvent)

  expect(mockElement.style.transform).toBe('')
})

test('useSwipeToDismiss handles missing sheet ref gracefully', () => {
  const onClose = vi.fn()
  const ref = { current: null }

  const { result } = renderHook(() => useSwipeToDismiss(ref, onClose, 80))
  const handlers = result.current

  // TouchStart with null ref
  handlers.onTouchStart({
    touches: [{ clientY: 100 }],
  } as unknown as React.TouchEvent)

  // TouchMove with null ref
  handlers.onTouchMove({
    touches: [{ clientY: 150 }],
  } as unknown as React.TouchEvent)

  // TouchEnd with null ref
  handlers.onTouchEnd({
    changedTouches: [{ clientY: 150 }],
  } as unknown as React.TouchEvent)

  expect(onClose).not.toHaveBeenCalled()
})
