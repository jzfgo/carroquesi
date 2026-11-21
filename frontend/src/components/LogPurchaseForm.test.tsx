import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import LogPurchaseForm from './LogPurchaseForm'
import { ADD_STORE } from './StoreSelect'

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
  bought_by_weight: false,
  purchase_ends_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'user-1',
  created_at: '',
  updated_at: '',
}

describe('LogPurchaseForm quantity and price calculation', () => {
  it('calls onSave with updated price, store, and quantity when clicked', async () => {
    const onSave = vi.fn()
    const item = { ...BASE_ITEM }
    render(
      <LogPurchaseForm
        item={item}
        initialAmount={1.5}
        initialStore="Lidl"
        initialPurchasedQuantity="3"
        onSave={onSave}
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

  it("offers the trip's store first, beside the item's planned stores", () => {
    const item = {
      ...BASE_ITEM,
      purchase_store: 'Mercadona',
      stores: ['Ahorramas', 'MERCADONA'],
    }
    render(
      <LogPurchaseForm
        item={item}
        initialAmount={null}
        initialStore="Mercadona"
        initialPurchasedQuantity={null}
        onSave={vi.fn()}
      />,
    )
    const select = screen.getByLabelText<HTMLSelectElement>('Tienda')
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels.filter((l) => /mercadona/i.test(l ?? ''))).toEqual([
      'Mercadona',
    ])
    expect(labels.indexOf('Mercadona')).toBeLessThan(
      labels.indexOf('Ahorramas'),
    )
    expect(select.value).toBe('Mercadona')
  })

  it('offers one option per store across spelling variants', () => {
    const item = {
      ...BASE_ITEM,
      stores: ['Ahorramás', 'AHORRA MAS', 'Lidl'],
    }
    render(
      <LogPurchaseForm
        item={item}
        initialAmount={null}
        initialStore={null}
        initialPurchasedQuantity={null}
        onSave={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('option', { name: 'Ahorramás' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'AHORRA MAS' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Lidl' })).toBeInTheDocument()
  })

  it('a hand-typed spelling variant reuses the existing offer form', async () => {
    const onSave = vi.fn()
    const item = { ...BASE_ITEM, stores: ['Ahorramás'] }
    render(
      <LogPurchaseForm
        item={item}
        initialAmount={2}
        initialStore={null}
        initialPurchasedQuantity={null}
        onSave={onSave}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Tienda'), ADD_STORE)
    await userEvent.type(
      screen.getByPlaceholderText(/nombre de la tienda/i),
      'ahorra mas',
    )
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onSave).toHaveBeenCalledWith(2, null, 'Ahorramás', null)
  })

  it('shows live cost preview when quantity and price are filled', async () => {
    render(
      <LogPurchaseForm
        item={BASE_ITEM}
        initialAmount={2.0}
        initialStore="Lidl"
        initialPurchasedQuantity="500g"
        onSave={vi.fn()}
      />,
    )

    // 2.0 €/kg * 0.5 kg = 1.00 €
    expect(screen.getByText(/1,00 €/)).toBeInTheDocument()
  })
})
