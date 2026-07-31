import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import LogPurchaseSheet from './LogPurchaseSheet'

const BASE_ITEM: ListItem = {
  id: 'i1',
  list_id: 'l1',
  name: 'Leche',
  quantity: null,
  brand: null,
  stores: [],
  purchased: false,
  purchased_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'user-1',
  created_at: '',
  updated_at: '',
}

describe('LogPurchaseSheet delete button', () => {
  const baseProps = {
    initialAmount: null,
    initialPricePer: null as null,
    initialStore: null,
    initialPurchasedQuantity: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
    // Same conversion, and this one is worth a word: a describe body is not
    // obviously module-load code, but it runs once at collection — before
    // any test — so the first mockReset wipes it exactly as it would a
    // top-level const.
    onDelete: vi.fn<() => Promise<void>>(async () => {}),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('is hidden when item has no price', () => {
    render(<LogPurchaseSheet {...baseProps} item={BASE_ITEM} />)
    expect(
      screen.queryByRole('button', { name: /eliminar precio/i }),
    ).not.toBeInTheDocument()
  })

  it('is shown when item has a price and is unpurchased (pending, not a filed record)', () => {
    const item = { ...BASE_ITEM, price: 1.99 }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(
      screen.getByRole('button', { name: /eliminar precio/i }),
    ).toBeInTheDocument()
  })

  it('is shown when the item is in the cart on a trip that has not ended', () => {
    const item = {
      ...BASE_ITEM,
      price: 1.99,
      purchased: true,
      purchased_at: '2026-07-28T09:00:00',
      purchase_id: 'p1',
      purchase_ends_at: '2026-07-28T23:00:00',
    }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(
      screen.getByRole('button', { name: /eliminar precio/i }),
    ).toBeInTheDocument()
  })

  it('is shown when purchased offline and not yet filed under a trip', () => {
    // No purchase_ends_at: the server has not said which trip this joined,
    // so it reads as cart, not a settled record.
    const item = {
      ...BASE_ITEM,
      price: 1.99,
      purchased: true,
      purchased_at: '2026-07-28T09:00:00',
    }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(
      screen.getByRole('button', { name: /eliminar precio/i }),
    ).toBeInTheDocument()
  })

  it('is hidden when the item has a price but its trip has already ended (filed)', () => {
    const item = {
      ...BASE_ITEM,
      price: 1.99,
      purchased: true,
      purchased_at: '2026-07-27T21:00:00',
      purchase_id: 'p1',
      purchase_ends_at: '2026-07-28T00:00:00',
    }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(
      screen.queryByRole('button', { name: /eliminar precio/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onDelete when the button is clicked', async () => {
    const onDelete = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const item = { ...BASE_ITEM, price: 1.99 }
    render(
      <LogPurchaseSheet
        initialAmount={1.99}
        initialPricePer={null}
        initialStore={null}
        initialPurchasedQuantity={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onDelete={onDelete}
        item={item}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: /eliminar precio/i }),
    )
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
    render(
      <LogPurchaseSheet {...baseProps} item={BASE_ITEM} isOffline={false} />,
    )
    expect(
      screen.queryByText(/disponible con conexión/i),
    ).not.toBeInTheDocument()
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
      />,
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
      />,
    )

    // 2.0 €/kg * 0.5 kg = 1.00 €
    expect(screen.getByText(/€ 1,00/i)).toBeInTheDocument()
  })
})
