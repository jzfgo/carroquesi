import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import LogPurchaseSheet from './LogPurchaseSheet'

const BASE_ITEM: ListItem = {
  id: 'i1',
  list_id: 'l1',
  name: 'Leche',
  quantity: null,
  purchased_quantity: null,
  brand: null,
  stores: [],
  purchased: false,
  purchased_at: null,
  purchase_has_receipt: false,
  purchase_ends_at: null,
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
    initialStore: null,
    initialPurchasedQuantity: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn(async () => undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is hidden when item has no price', () => {
    render(<LogPurchaseSheet {...baseProps} item={BASE_ITEM} />)
    expect(
      screen.queryByRole('button', { name: /eliminar precio/i }),
    ).not.toBeInTheDocument()
  })

  it('is shown when item has a price and is unpurchased', () => {
    const item = { ...BASE_ITEM, price: 1.99 }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(
      screen.getByRole('button', { name: /eliminar precio/i }),
    ).toBeInTheDocument()
  })

  it('is shown when item has a price and its trip is still open', () => {
    const item = {
      ...BASE_ITEM,
      price: 1.99,
      purchased: true,
      purchased_at: new Date().toISOString(),
      purchase_ends_at: new Date(Date.now() + 60 * 60 * 1000)
        .toISOString()
        .slice(0, -1),
    }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(
      screen.getByRole('button', { name: /eliminar precio/i }),
    ).toBeInTheDocument()
  })

  it('is hidden when item has a price but its trip has ended', () => {
    const item = {
      ...BASE_ITEM,
      price: 1.99,
      purchased: true,
      purchased_at: '2020-01-01T00:00:00',
      purchase_ends_at: '2020-01-02T00:00:00',
    }
    render(<LogPurchaseSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(
      screen.queryByRole('button', { name: /eliminar precio/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onDelete when the button is clicked', async () => {
    const onDelete = vi.fn(async () => undefined)
    const item = { ...BASE_ITEM, price: 1.99 }
    render(
      <LogPurchaseSheet
        initialAmount={1.99}
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

describe('LogPurchaseSheet quantity and price calculation', () => {
  it('calls onSave with updated price, store, and quantity when clicked', async () => {
    const onSave = vi.fn()
    const item = { ...BASE_ITEM }
    render(
      <LogPurchaseSheet
        item={item}
        initialAmount={1.5}
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

  it('renders one chip per store across spelling variants', () => {
    const item = {
      ...BASE_ITEM,
      stores: ['Ahorramás', 'AHORRA MAS', 'Lidl'],
    }
    render(
      <LogPurchaseSheet
        item={item}
        initialAmount={null}
        initialStore={null}
        initialPurchasedQuantity={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Ahorramás/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /AHORRA MAS/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lidl/ })).toBeInTheDocument()
  })

  it('a hand-typed spelling variant reuses the existing chip form', async () => {
    const onSave = vi.fn()
    const item = { ...BASE_ITEM, stores: ['Ahorramás'] }
    render(
      <LogPurchaseSheet
        item={item}
        initialAmount={2}
        initialStore={null}
        initialPurchasedQuantity={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Añadir otra tienda' }),
    )
    await userEvent.type(
      screen.getByPlaceholderText(/nombre de la tienda/i),
      'ahorra mas',
    )
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onSave).toHaveBeenCalledWith(2, null, 'Ahorramás', null)
  })

  it('shows live cost preview when quantity and price are filled', async () => {
    render(
      <LogPurchaseSheet
        item={BASE_ITEM}
        initialAmount={2.0}
        initialStore="Lidl"
        initialPurchasedQuantity="500g"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // 2.0 €/kg * 0.5 kg = 1.00 €
    expect(screen.getByText(/€1\.00/i)).toBeInTheDocument()
  })
})
