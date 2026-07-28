import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiList } from '../types'
import { ListCard } from './ListCard'

const makeList = (overrides: Partial<ApiList> = {}): ApiList => ({
  id: 'l1',
  name: 'Mercado semanal',
  emoji: null,
  owner_id: 'u1',
  created_at: '',
  updated_at: '',
  item_count: 8,
  purchased_count: 3,
  is_default: false,
  ...overrides,
})

describe('ListCard', () => {
  it('shows the list name', () => {
    render(<ListCard list={makeList()} onClick={vi.fn()} />)
    expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
  })

  it('puts the size of the list in the figure on the right', () => {
    const { container } = render(
      <ListCard
        list={makeList({ item_count: 8, purchased_count: 3 })}
        onClick={vi.fn()}
      />,
    )
    expect(container.querySelector('.list-card__count')).toHaveTextContent('8')
  })

  it('says how far along without repeating the total (rule 3)', () => {
    render(
      <ListCard
        list={makeList({ item_count: 8, purchased_count: 3 })}
        onClick={vi.fn()}
      />,
    )
    expect(screen.getByText('3 comprados')).toBeInTheDocument()
    expect(screen.queryByText(/de 8/)).not.toBeInTheDocument()
  })

  it('drops the meta line — and 6px of height — when nothing is bought yet', () => {
    const { container } = render(
      <ListCard
        list={makeList({ item_count: 8, purchased_count: 0 })}
        onClick={vi.fn()}
      />,
    )
    expect(container.querySelector('.list-card__subtitle')).toBeNull()
    expect(container.querySelector('.list-card')).not.toHaveClass(
      'list-card--meta',
    )
  })

  it('an empty list offers the action that fills it', () => {
    const { container } = render(
      <ListCard
        list={makeList({ item_count: 0, purchased_count: 0 })}
        onClick={vi.fn()}
      />,
    )
    expect(screen.getByText('vacía · añade lo primero')).toBeInTheDocument()
    expect(container.querySelector('.list-card')).toHaveClass('list-card--meta')
  })

  it('leaves the figure blank on an empty list rather than printing a zero', () => {
    const { container } = render(
      <ListCard
        list={makeList({ item_count: 0, purchased_count: 0 })}
        onClick={vi.fn()}
      />,
    )
    expect(container.querySelector('.list-card__count')).toHaveTextContent('')
  })

  it('opens the list when tapped', () => {
    const onClick = vi.fn()
    render(<ListCard list={makeList()} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /mercado semanal/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is a flat panel row, never a card, and never carries a board colour', () => {
    const { container } = render(
      <ListCard list={makeList()} onClick={vi.fn()} />,
    )
    // Rule 8: the paper stays inside an open list. 38b and 38c both drew the
    // board out here and both were refused.
    expect(container.querySelector('[data-board]')).toBeNull()
    expect(container.querySelector('.progress-bar')).toBeNull()
  })
})

describe('ListCard — the row is only a way in', () => {
  it('has exactly one target: the row itself', () => {
    const { container } = render(
      <ListCard list={makeList({ emoji: '🛒' })} onClick={vi.fn()} />,
    )
    // Everything a list can have *done* to it — renamed, shared, deleted, its
    // board and emoji chosen — is reached by opening the list, so there is one
    // path to each and the panel stays a way in (rule 1).
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('shows the emoji as a glyph, not a control', () => {
    const { container } = render(
      <ListCard list={makeList({ emoji: '🛒' })} onClick={vi.fn()} />,
    )
    const emoji = container.querySelector('.list-card__emoji')!
    expect(emoji).toHaveTextContent('🛒')
    expect(emoji.tagName).not.toBe('BUTTON')
  })

  it('holds the emoji column open when a list has none, so rows stay aligned', () => {
    const { container } = render(
      <ListCard list={makeList({ emoji: null })} onClick={vi.fn()} />,
    )
    expect(container.querySelector('.list-card__emoji')).toBeInTheDocument()
    expect(container.querySelector('.list-card__emoji')).toHaveTextContent('')
  })

  it('carries the drag listeners on the row — reordering is a long press, not a grip', () => {
    const onPointerDown = vi.fn()
    const { container } = render(
      <ListCard
        list={makeList()}
        onClick={vi.fn()}
        dragHandleProps={{ onPointerDown }}
      />,
    )
    fireEvent.pointerDown(container.querySelector('.list-card__tap-target')!)
    expect(onPointerDown).toHaveBeenCalled()
  })

  it('marks the default list without spending a column on it', () => {
    const { container } = render(
      <ListCard list={makeList({ is_default: true })} onClick={vi.fn()} />,
    )
    expect(container.querySelector('.list-card__default-star')).not.toBeNull()
    expect(
      screen.getByRole('button', { name: /lista predeterminada/i }),
    ).toBeInTheDocument()
  })
})

describe('ListCard — arranging', () => {
  it('stops being a way in: no button, no chevron', () => {
    const onClick = vi.fn()
    const { container } = render(
      <ListCard list={makeList()} onClick={onClick} reordering />,
    )
    expect(
      screen.queryByRole('button', { name: 'Mercado semanal' }),
    ).not.toBeInTheDocument()
    expect(container.querySelector('.list-card__chevron')).toBeNull()
    expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
  })

  it('offers a move in each direction, named for the list they move', () => {
    render(
      <ListCard
        list={makeList()}
        onClick={vi.fn()}
        reordering
        onMove={vi.fn()}
      />,
    )
    // The name is in the label because a screen reader reaches these buttons
    // one at a time, out of the row's context.
    expect(
      screen.getByRole('button', { name: 'Subir Mercado semanal' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Bajar Mercado semanal' }),
    ).toBeInTheDocument()
  })

  it('reports the direction it was asked for', () => {
    const onMove = vi.fn()
    render(
      <ListCard
        list={makeList()}
        onClick={vi.fn()}
        reordering
        onMove={onMove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Subir/ }))
    expect(onMove).toHaveBeenCalledWith('up')
    fireEvent.click(screen.getByRole('button', { name: /^Bajar/ }))
    expect(onMove).toHaveBeenCalledWith('down')
  })

  it('marks the move that would go off the end unavailable, but still focusable', () => {
    const onMove = vi.fn()
    const { rerender } = render(
      <ListCard
        list={makeList()}
        onClick={vi.fn()}
        reordering
        isFirst
        onMove={onMove}
      />,
    )
    const up = screen.getByRole('button', { name: /^Subir/ })
    expect(up).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: /^Bajar/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    )

    // aria-disabled leaves it clickable, so the handler is what has to refuse.
    fireEvent.click(up)
    expect(onMove).not.toHaveBeenCalled()

    // And genuinely disabled it is not — that is what keeps focus from being
    // dropped on the move that reaches an end.
    expect(up).not.toBeDisabled()
    up.focus()
    expect(document.activeElement).toBe(up)

    rerender(<ListCard list={makeList()} onClick={vi.fn()} reordering isLast />)
    expect(screen.getByRole('button', { name: /^Subir/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    expect(screen.getByRole('button', { name: /^Bajar/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  // Withholding these is the point of the mode, not an oversight: dnd-kit's
  // attributes carry role="button", tabIndex and aria-describedby, and the
  // reordering row is a span. Landing them there would announce a control that
  // cannot be operated.
  it('takes no drag props while arranging', () => {
    const onPointerDown = vi.fn()
    const { container } = render(
      <ListCard
        list={makeList()}
        onClick={vi.fn()}
        reordering
        dragHandleProps={{ onPointerDown, role: 'button', tabIndex: 0 }}
      />,
    )
    const target = container.querySelector('.list-card__tap-target')!
    expect(target.getAttribute('role')).toBeNull()
    expect(target.getAttribute('tabindex')).toBeNull()
  })
})
