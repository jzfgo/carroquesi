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
