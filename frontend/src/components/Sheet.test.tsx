import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sheet, type SheetHandle } from './Sheet'

// jsdom applies no stylesheet, so the exit transition measures 0ms and the
// close resolves synchronously — the same path a reduced-motion user takes.
// Animated-path tests stub getComputedStyle to report a real duration.
function stubExitDuration(duration: string) {
  vi.stubGlobal(
    'getComputedStyle',
    vi.fn(
      () =>
        ({
          transitionDuration: duration,
          getPropertyValue: () => '',
        }) as unknown as CSSStyleDeclaration,
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.style.overflow = ''
})

function panel(): HTMLElement {
  return document.querySelector('.modal-sheet')!
}

describe('Sheet chrome and aria wiring', () => {
  it('renders children inside an aria-modal dialog labelled by `label`', () => {
    render(
      <Sheet label="Opciones" onClose={vi.fn()}>
        <p>contenido</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Opciones' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('supports labelledBy wiring', () => {
    render(
      <Sheet labelledBy="sheet-title" onClose={vi.fn()}>
        <h2 id="sheet-title">Título</h2>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Título' })).toHaveAttribute(
      'aria-labelledby',
      'sheet-title',
    )
  })

  it('passes className through to the panel and portals to document.body', () => {
    render(
      <Sheet label="x" className="list-action-sheet" onClose={vi.fn()}>
        <p>contenido</p>
      </Sheet>,
    )
    const el = document.querySelector('.list-action-sheet')!
    expect(el).toHaveClass('modal-sheet')
    expect(el.parentElement).toBe(document.body)
  })

  it('renders a grabber handle', () => {
    render(
      <Sheet label="x" onClose={vi.fn()}>
        <p>contenido</p>
      </Sheet>,
    )
    expect(document.querySelector('.modal-sheet__handle')).toBeInTheDocument()
  })
})

describe('dismissal', () => {
  it('Escape closes instantly when the exit has no duration (reduced motion)', () => {
    const onClose = vi.fn()
    render(
      <Sheet label="x" onClose={onClose}>
        <p>contenido</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('scrim click closes', () => {
    const onClose = vi.fn()
    render(
      <Sheet label="x" onClose={onClose}>
        <p>contenido</p>
      </Sheet>,
    )
    fireEvent.click(document.querySelector('.modal-sheet-scrim')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('onDismiss overrides dismiss gestures and keeps the sheet open', () => {
    const onClose = vi.fn()
    const onDismiss = vi.fn()
    render(
      <Sheet label="x" onClose={onClose} onDismiss={onDismiss}>
        <p>contenido</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('.modal-sheet-scrim')!)
    expect(onDismiss).toHaveBeenCalledTimes(2)
    expect(onClose).not.toHaveBeenCalled()
    expect(panel()).not.toHaveClass('modal-sheet--closing')
  })

  it('ref handle close() runs the same closing path', () => {
    const onClose = vi.fn()
    const ref = { current: null as SheetHandle | null }
    render(
      <Sheet label="x" onClose={onClose} ref={ref}>
        <p>contenido</p>
      </Sheet>,
    )
    ref.current!.close()
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('close animation', () => {
  it('plays the exit and calls onClose on transitionend', () => {
    stubExitDuration('0.32s')
    const onClose = vi.fn()
    render(
      <Sheet label="x" onClose={onClose}>
        <p>contenido</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(panel()).toHaveClass('modal-sheet--closing')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.transitionEnd(panel())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores transitionend bubbling from children', () => {
    stubExitDuration('0.32s')
    const onClose = vi.fn()
    render(
      <Sheet label="x" onClose={onClose}>
        <button>hijo</button>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.transitionEnd(screen.getByRole('button', { name: 'hijo' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('falls back to a timeout when transitionend never fires', () => {
    vi.useFakeTimers()
    stubExitDuration('0.32s')
    const onClose = vi.fn()
    render(
      <Sheet label="x" onClose={onClose}>
        <p>contenido</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    vi.advanceTimersByTime(320)
    expect(onClose).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('a late transitionend after the fallback does not close twice', () => {
    vi.useFakeTimers()
    stubExitDuration('0.32s')
    const onClose = vi.fn()
    render(
      <Sheet label="x" onClose={onClose}>
        <p>contenido</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    vi.advanceTimersByTime(500)
    fireEvent.transitionEnd(panel())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('rapid double dismiss closes exactly once', () => {
    stubExitDuration('0.32s')
    const onClose = vi.fn()
    render(
      <Sheet label="x" onClose={onClose}>
        <p>contenido</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(document.querySelector('.modal-sheet-scrim')!)
    fireEvent.transitionEnd(panel())
    fireEvent.transitionEnd(panel())
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('focus management', () => {
  it('moves initial focus to the panel', () => {
    render(
      <Sheet label="x" onClose={vi.fn()}>
        <button>uno</button>
      </Sheet>,
    )
    expect(document.activeElement).toBe(panel())
  })

  it('Tab on the last focusable wraps to the first', () => {
    render(
      <Sheet label="x" onClose={vi.fn()}>
        <button>uno</button>
        <button>dos</button>
      </Sheet>,
    )
    screen.getByRole('button', { name: 'dos' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'uno' }),
    )
  })

  it('Shift+Tab from the first focusable (or the panel) wraps to the last', () => {
    render(
      <Sheet label="x" onClose={vi.fn()}>
        <button>uno</button>
        <button>dos</button>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'dos' }),
    )
    screen.getByRole('button', { name: 'uno' }).focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'dos' }),
    )
  })

  it('Tab pulls focus back in after the focused element was unmounted', () => {
    render(
      <Sheet label="x" onClose={vi.fn()}>
        <button>uno</button>
        <button>dos</button>
      </Sheet>,
    )
    // A content swap unmounts the focused element; focus falls to <body>.
    ;(document.activeElement as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'uno' }),
    )
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'dos' }),
    )
  })

  it('restores focus to the previously focused element on unmount', () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    const { unmount } = render(
      <Sheet label="x" onClose={vi.fn()}>
        <button>uno</button>
      </Sheet>,
    )
    expect(document.activeElement).toBe(panel())
    unmount()
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})

describe('body scroll lock', () => {
  it('locks body scroll while mounted and restores the previous value', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = render(
      <Sheet label="x" onClose={vi.fn()}>
        <p>contenido</p>
      </Sheet>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })
})
