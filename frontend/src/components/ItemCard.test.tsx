import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import { ItemCard } from './ItemCard'

const makeItem = (overrides: Partial<ListItem> = {}): ListItem => ({
  id: 'i1',
  list_id: 'l1',
  name: 'Leche entera',
  quantity: null,
  purchased_quantity: null,
  brand: null,
  stores: [],
  purchased: false,
  purchased_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
  ...overrides,
})

const TODAY = new Date().toISOString().slice(0, 19)
const EARLIER = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 19)
})()

const renderCard = (overrides: Partial<ListItem> = {}) => {
  const onTogglePurchased = vi.fn()
  const onOpen = vi.fn()
  const onClone = vi.fn()
  const result = render(
    <ItemCard
      item={makeItem(overrides)}
      onTogglePurchased={onTogglePurchased}
      onOpen={onOpen}
      onClone={onClone}
    />,
  )
  return { ...result, onTogglePurchased, onOpen, onClone }
}

describe('the row says what the line is, and nothing else', () => {
  it('shows the name', () => {
    renderCard()
    expect(screen.getByText('Leche entera')).toBeInTheDocument()
  })

  it('has exactly two targets: the mark, and the rest of the row (rule 7)', () => {
    const { container } = renderCard({ quantity: '2', brand: 'Hacendado' })
    expect(container.querySelectorAll('button')).toHaveLength(2)
  })

  it('carries no chips to fill in — inside a sheet there is only ink (rule 2)', () => {
    const { container } = renderCard({ brand: 'Hacendado', stores: ['Dia'] })
    expect(container.querySelector('.item-card__tag')).toBeNull()
    expect(container.querySelector('.item-card__avatar')).toBeNull()
    expect(container.querySelector('.item-card__menu')).toBeNull()
  })

  it('opens the item when the line is tapped', () => {
    const { onOpen } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Leche entera' }))
    expect(onOpen).toHaveBeenCalledWith('i1')
  })
})

describe('the three states', () => {
  it('still on the list: an empty ring that puts it in the cart', () => {
    const { onTogglePurchased } = renderCard()
    const circle = screen.getByRole('checkbox', { name: 'Poner en el carro' })
    expect(circle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(circle)
    expect(onTogglePurchased).toHaveBeenCalledWith('i1')
  })

  it('in the cart: neither done nor untouched', () => {
    renderCard({ purchased: true, purchased_at: TODAY })
    expect(
      screen.getByRole('checkbox', { name: 'Sacar del carro' }),
    ).toHaveAttribute('aria-checked', 'mixed')
  })

  it('settled: no circle at all, because a record has no state to toggle', () => {
    const { container } = renderCard({ purchased: true, purchased_at: EARLIER })
    expect(container.querySelector('.item-card__checkbox')).toBeNull()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('settled: the leading column offers the one thing left — buy it again', () => {
    const { onClone } = renderCard({ purchased: true, purchased_at: EARLIER })
    fireEvent.click(
      screen.getByRole('button', { name: /volver a comprar leche entera/i }),
    )
    expect(onClone).toHaveBeenCalledWith('i1')
  })

  it('settled with no way to re-add it, the disc is inert rather than absent', () => {
    render(
      <ItemCard
        item={makeItem({ purchased: true, purchased_at: EARLIER })}
        onTogglePurchased={vi.fn()}
        onOpen={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: /volver a comprar/i }),
    ).toBeDisabled()
  })
})

describe('the figure column', () => {
  it('holds the quantity while the line is still an instruction', () => {
    const { container } = renderCard({ quantity: '2 ud' })
    expect(container.querySelector('.item-card__figure')).toHaveTextContent(
      '2 ud',
    )
  })

  it('holds the amount once the line is a record', () => {
    const { container } = renderCard({
      purchased: true,
      purchased_at: EARLIER,
      price: 1.35,
    })
    expect(container.querySelector('.item-card__figure')?.textContent).toMatch(
      /1[,.]35/,
    )
  })

  it('stays empty on a settled line with no price, so the gap is the point', () => {
    // Jamón cocido: bought, quantity recorded, price never captured. Printing
    // "200g" here would both hide the missing price and repeat the second
    // line, which already says the quantity.
    const { container } = renderCard({
      purchased: true,
      purchased_at: EARLIER,
      quantity: '200g',
      purchased_quantity: '200g',
      price: null,
    })
    expect(container.querySelector('.item-card__figure')?.textContent).toBe('')
    expect(container.querySelector('.item-card__sub')).toHaveTextContent('200g')
  })

  it('keeps the quantity in the cart, where the column is not money yet', () => {
    const { container } = renderCard({
      purchased: true,
      purchased_at: TODAY,
      quantity: '1 kg',
    })
    expect(container.querySelector('.item-card__figure')).toHaveTextContent(
      '1 kg',
    )
  })

  it('is left empty when there is neither — a dash would make it a form', () => {
    const { container } = renderCard({
      purchased: true,
      purchased_at: EARLIER,
      price: null,
    })
    expect(container.querySelector('.item-card__figure')).toHaveTextContent('')
  })

  it('a settled line prints what was actually bought, under what it was', () => {
    const { container } = renderCard({
      purchased: true,
      purchased_at: EARLIER,
      quantity: '2 ud',
      purchased_quantity: '3 ud',
    })
    expect(container.querySelector('.item-card__sub')).toHaveTextContent('3 ud')
  })
})

describe('the second line', () => {
  it('holds the brand while the line is still to buy', () => {
    const { container } = renderCard({ brand: 'Hacendado' })
    expect(container.querySelector('.item-card__sub')).toHaveTextContent(
      'Hacendado',
    )
  })

  it('leaves the quantity in the figure column while it is an instruction', () => {
    // Quantity and brand do not share the second line until the figure column
    // has been taken over by what the thing cost.
    const { container } = renderCard({ brand: 'Hacendado', quantity: '2 ud' })
    expect(container.querySelector('.item-card__sub')).toHaveTextContent(
      'Hacendado',
    )
    expect(container.querySelector('.item-card__figure')).toHaveTextContent(
      '2 ud',
    )
  })

  it('is quantity then brand once the line is settled', () => {
    const { container } = renderCard({
      purchased: true,
      purchased_at: EARLIER,
      purchased_quantity: '12 ud',
      brand: 'Puleva',
    })
    expect(container.querySelector('.item-card__sub')).toHaveTextContent(
      '12 ud · Puleva',
    )
  })

  it('drops the separator when a settled line has only one of them', () => {
    const { container } = renderCard({
      purchased: true,
      purchased_at: EARLIER,
      purchased_quantity: '1 ud',
    })
    expect(container.querySelector('.item-card__sub')?.textContent).toBe('1 ud')
  })

  it('is not drawn at all when there is nothing to put on it (rule 6)', () => {
    const { container } = renderCard()
    expect(container.querySelector('.item-card__sub')).toBeNull()
  })

  it('carries the brand in the cart too — the line has not come off the list', () => {
    const { container } = renderCard({
      purchased: true,
      purchased_at: TODAY,
      brand: 'Hacendado',
    })
    expect(container.querySelector('.item-card__sub')).toHaveTextContent(
      'Hacendado',
    )
  })
})

describe('the day boundary', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a line marked before midnight has become a record by morning', () => {
    const now = new Date()
    now.setHours(9, 0, 0, 0)
    vi.setSystemTime(now)
    const lastNight = new Date(now)
    lastNight.setHours(-2, 0, 0, 0)

    const { container } = renderCard({
      purchased: true,
      purchased_at: lastNight.toISOString().slice(0, 19),
    })
    expect(container.querySelector('.item-card__again')).not.toBeNull()
  })
})
