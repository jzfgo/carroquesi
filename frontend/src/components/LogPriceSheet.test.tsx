import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LogPriceSheet, { isSameCalendarDay } from './LogPriceSheet'
import type { ListItem } from '../types'

const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1',
  name: 'Leche', quantity: null, brand: null, stores: [],
  purchased: false, purchased_at: null, ean: null,
  price: null, price_per: null, price_store: null,
  added_by: 'user-1', created_at: '', updated_at: '',
}

describe('isSameCalendarDay', () => {
  it('returns true for null', () => {
    expect(isSameCalendarDay(null)).toBe(true)
  })

  it('returns true for a timestamp from today', () => {
    expect(isSameCalendarDay(new Date().toISOString())).toBe(true)
  })

  it('returns false for a timestamp from yesterday', () => {
    const yesterday = '2020-01-01T00:00:00.000Z'
    expect(isSameCalendarDay(yesterday)).toBe(false)
  })
})

describe('LogPriceSheet delete button', () => {
  const baseProps = {
    initialAmount: null,
    initialPricePer: null as null,
    initialStore: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is hidden when item has no price', () => {
    render(<LogPriceSheet {...baseProps} item={BASE_ITEM} />)
    expect(screen.queryByRole('button', { name: /eliminar precio/i })).not.toBeInTheDocument()
  })

  it('is shown when item has a price and is unpurchased', () => {
    const item = { ...BASE_ITEM, price: 1.99 }
    render(<LogPriceSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.getByRole('button', { name: /eliminar precio/i })).toBeInTheDocument()
  })

  it('is shown when item has a price and was purchased today', () => {
    const item = { ...BASE_ITEM, price: 1.99, purchased: true, purchased_at: new Date().toISOString() }
    render(<LogPriceSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.getByRole('button', { name: /eliminar precio/i })).toBeInTheDocument()
  })

  it('is hidden when item has a price but was purchased on a previous day', () => {
    const yesterday = '2020-01-01T00:00:00.000Z'
    const item = { ...BASE_ITEM, price: 1.99, purchased: true, purchased_at: yesterday }
    render(<LogPriceSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.queryByRole('button', { name: /eliminar precio/i })).not.toBeInTheDocument()
  })

  it('calls onDelete when the button is clicked', async () => {
    const onDelete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const item = { ...BASE_ITEM, price: 1.99 }
    render(<LogPriceSheet initialAmount={1.99} initialPricePer={null} initialStore={null} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} item={item} />)
    await userEvent.click(screen.getByRole('button', { name: /eliminar precio/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
