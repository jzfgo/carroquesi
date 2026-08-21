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
  cart_count: 0,
  members: [],
  is_default: false,
  ...overrides,
})

const renderCard = (
  list: ApiList,
  props: Partial<Parameters<typeof ListCard>[0]> = {},
) =>
  render(
    <ListCard
      list={list}
      currentUserId="u1"
      isOwner={false}
      onClick={vi.fn()}
      onMenuOpen={vi.fn()}
      {...props}
    />,
  )

describe('ListCard', () => {
  it('shows the list name', () => {
    renderCard(makeList())
    expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
  })

  it('shows the pending count (item_count minus purchased_count)', () => {
    const { container } = renderCard(
      makeList({ item_count: 8, purchased_count: 3 }),
    )
    expect(container.querySelector('.list-card__pending')).toHaveTextContent(
      '5',
    )
  })

  it('shows 0 pending when everything is purchased', () => {
    const { container } = renderCard(
      makeList({ item_count: 4, purchased_count: 4 }),
    )
    expect(container.querySelector('.list-card__pending')).toHaveTextContent(
      '0',
    )
  })

  it('shows the members subtitle, viewer excluded', () => {
    renderCard(
      makeList({
        members: [
          { user_id: 'u1', display_name: 'Alice' },
          { user_id: 'u2', display_name: 'Marta' },
        ],
      }),
    )
    expect(screen.getByText('Marta y tú')).toBeInTheDocument()
  })

  it('appends the cart count to the subtitle', () => {
    renderCard(
      makeList({
        members: [
          { user_id: 'u1', display_name: 'Alice' },
          { user_id: 'u2', display_name: 'Marta' },
        ],
        cart_count: 3,
      }),
    )
    expect(screen.getByText('Marta y tú · 3 en el carro')).toBeInTheDocument()
  })

  it('renders compact — no subtitle element — for a solo list with an empty cart', () => {
    const { container } = renderCard(
      makeList({
        members: [{ user_id: 'u1', display_name: 'Alice' }],
        cart_count: 0,
      }),
    )
    expect(container.querySelector('.list-card__subtitle')).toBeNull()
    expect(container.querySelector('.list-card--subtitled')).toBeNull()
  })

  it('does not crash on cached payloads that predate members and cart_count', () => {
    const stale = makeList()
    // The localStorage dashboard cache can hold pre-JAV-136 list shapes.
    delete (stale as Partial<ApiList>).members
    delete (stale as Partial<ApiList>).cart_count
    const { container } = renderCard(stale)
    expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
    expect(container.querySelector('.list-card__subtitle')).toBeNull()
  })

  it('calls onClick when the row body is clicked', () => {
    const onClick = vi.fn()
    renderCard(makeList(), { onClick })
    fireEvent.click(screen.getByRole('button', { name: /mercado semanal/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('⋯ button is present', () => {
    renderCard(makeList())
    expect(
      screen.getByRole('button', { name: /opciones/i }),
    ).toBeInTheDocument()
  })

  it('tapping ⋯ calls onMenuOpen', () => {
    const onMenuOpen = vi.fn()
    renderCard(makeList(), { onMenuOpen })
    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    expect(onMenuOpen).toHaveBeenCalledOnce()
  })

  it('tapping ⋯ does not call onClick', () => {
    const onClick = vi.fn()
    renderCard(makeList(), { onClick })
    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ListCard — emoji', () => {
  it('renders emoji as a tappable button for the owner', () => {
    renderCard(makeList({ emoji: '🛒' }), {
      isOwner: true,
      onEmojiTap: vi.fn(),
    })
    expect(
      screen.getByRole('button', { name: /cambiar emoji/i }),
    ).toHaveTextContent('🛒')
  })

  it('renders emoji as a non-interactive span for non-owners', () => {
    renderCard(makeList({ emoji: '🛒' }))
    expect(
      screen.queryByRole('button', { name: /cambiar emoji/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('🛒')).toBeInTheDocument()
  })

  it('keeps an empty emoji column when emoji is null (non-owner)', () => {
    // The 36px column always renders so names align across rows.
    const { container } = renderCard(makeList({ emoji: null }))
    const slot = container.querySelector('.list-card__emoji')
    expect(slot).toBeInTheDocument()
    expect(slot).toHaveTextContent('')
    expect(slot?.tagName).toBe('SPAN')
  })

  it('owner with null emoji sees a placeholder add button', () => {
    renderCard(makeList({ emoji: null }), {
      isOwner: true,
      onEmojiTap: vi.fn(),
    })
    expect(
      screen.getByRole('button', { name: /añadir emoji/i }),
    ).toBeInTheDocument()
  })

  it('tapping emoji button calls onEmojiTap', () => {
    const onEmojiTap = vi.fn()
    renderCard(makeList({ emoji: '🛒' }), { isOwner: true, onEmojiTap })
    fireEvent.click(screen.getByRole('button', { name: /cambiar emoji/i }))
    expect(onEmojiTap).toHaveBeenCalledOnce()
  })

  it('tapping emoji button does not trigger the list onClick', () => {
    const onClick = vi.fn()
    renderCard(makeList({ emoji: '🛒' }), {
      isOwner: true,
      onClick,
      onEmojiTap: vi.fn(),
    })
    fireEvent.click(screen.getByRole('button', { name: /cambiar emoji/i }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
