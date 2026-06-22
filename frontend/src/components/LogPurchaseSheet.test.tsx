import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSameCalendarDay } from '../lib/isSameCalendarDay'
import type { ListItem } from '../types'
import LogPurchaseSheet from './LogPurchaseSheet'

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

describe('LogPurchaseSheet delete button', () => {
  const baseProps = {
    initialAmount: null,
    initialPricePer: null as null,
    initialStore: null,
    initialPurchasedQuantity: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is hidden when item has no price', () => {
    render(<LogPurchaseSheet {...baseProps} item={BASE_ITEM} />)
    expect(screen.queryByRole('button', { name: /eliminar precio/i })).not.toBeInTheDocument()
  })

  it('is shown when item has a price and is unpurchased', () => {
    const item = { ...BASE_ITEM, price: 1.99 }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.getByRole('button', { name: /eliminar precio/i })).toBeInTheDocument()
  })

  it('is shown when item has a price and was purchased today', () => {
    const item = { ...BASE_ITEM, price: 1.99, purchased: true, purchased_at: new Date().toISOString() }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.getByRole('button', { name: /eliminar precio/i })).toBeInTheDocument()
  })

  it('is hidden when item has a price but was purchased on a previous day', () => {
    const yesterday = '2020-01-01T00:00:00.000Z'
    const item = { ...BASE_ITEM, price: 1.99, purchased: true, purchased_at: yesterday }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.queryByRole('button', { name: /eliminar precio/i })).not.toBeInTheDocument()
  })

  it('calls onDelete when the button is clicked', async () => {
    const onDelete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const item = { ...BASE_ITEM, price: 1.99 }
    render(<LogPurchaseSheet initialAmount={1.99} initialPricePer={null} initialStore={null} initialPurchasedQuantity={null} onSave={vi.fn()} onClose={vi.fn()} onDelete={onDelete} item={item} />)
    await userEvent.click(screen.getByRole('button', { name: /eliminar precio/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})

describe('LogPurchaseSheet — offline', () => {
  const baseProps = {
    initialAmount: 1.99,
    initialPricePer: null as null,
    initialStore: null,
    initialPurchasedQuantity: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
  }

  it('shows offline message when isOffline is true', () => {
    render(<LogPurchaseSheet {...baseProps} item={BASE_ITEM} isOffline />)
    expect(screen.getByText(/disponible con conexión/i)).toBeInTheDocument()
  })

  it('disables save button when isOffline is true', () => {
    render(<LogPurchaseSheet {...baseProps} item={BASE_ITEM} isOffline />)
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
  })

  it('does not show offline message when isOffline is false', () => {
    render(<LogPurchaseSheet {...baseProps} item={BASE_ITEM} isOffline={false} />)
    expect(screen.queryByText(/disponible con conexión/i)).not.toBeInTheDocument()
  })
})

describe('LogPurchaseSheet quantity and price calculation', () => {
  it('calls onSave with updated price, store, and quantity when clicked', async () => {
    const onSave = vi.fn()
    const item = { ...BASE_ITEM }
    render(
      <LogPurchaseSheet
        item={item}
        initialAmount={1.5}
        initialPricePer={null}
        initialStore="Lidl"
        initialPurchasedQuantity="3"
        onSave={onSave}
        onClose={vi.fn()}
      />
    )

    const qtyInput = screen.getByPlaceholderText(/ej\. 3/i)
    await userEvent.clear(qtyInput)
    await userEvent.type(qtyInput, '5')

    const priceInput = screen.getByPlaceholderText('0.00')
    await userEvent.clear(priceInput)
    await userEvent.type(priceInput, '2.5')

    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSave).toHaveBeenCalledWith(2.5, null, 'Lidl', '5')
  })

  it('shows live cost preview when quantity and price are filled', async () => {
    render(
      <LogPurchaseSheet
        item={BASE_ITEM}
        initialAmount={2.0}
        initialPricePer="KILOGRAM"
        initialStore="Lidl"
        initialPurchasedQuantity="500g"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    // 2.0 €/kg * 0.5 kg = 1.00 €
    expect(screen.getByText(/€1\.00/i)).toBeInTheDocument()
  })
})
