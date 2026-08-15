import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { ReceiptLine } from '../lib/receiptReview'
import { ReceiptLineResolveBody } from './ReceiptLineResolveBody'
import type { ItemRef } from './ReceiptScanSheet'

const line: ReceiptLine = {
  receipt_name: 'CHOCO NGR 70% 100G',
  price_type: 'UNIT',
  unit_price: 3.18,
  quantity: null,
  line_total: 3.18,
}

const inCart: ItemRef = {
  id: 'in-cart',
  name: 'Pan de molde',
  purchased: true,
  purchased_at: '2026-04-11T15:00:00',
  brand: null,
  stores: ['Mercadona'],
  quantity: null,
  price: null,
  price_per: null,
}

const pendingWithStore: ItemRef = {
  id: 'pending-store',
  name: 'Servilletas',
  purchased: false,
  purchased_at: null,
  brand: null,
  stores: ['Mercadona'],
  quantity: null,
  price: null,
  price_per: null,
}

const pendingNoStore: ItemRef = {
  id: 'pending-nostore',
  name: 'Leche',
  purchased: false,
  purchased_at: null,
  brand: null,
  stores: [],
  quantity: null,
  price: null,
  price_per: null,
}

function renderBody(overrides: {
  candidateItems?: ItemRef[]
  createText?: string
}) {
  return render(
    <ReceiptLineResolveBody
      line={line}
      candidateItems={overrides.candidateItems ?? []}
      radioId={null}
      createText={overrides.createText ?? ''}
      onSelectRadio={vi.fn()}
      onChangeCreateText={vi.fn()}
      onAssign={vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

test('an in-cart candidate reads bare "en el carro"; a pending one names its store', () => {
  renderBody({ candidateItems: [inCart, pendingWithStore, pendingNoStore] })

  // The cart item's store isn't settled until the receipt closes the trip, so it
  // shows without one — never "en el carro · Mercadona".
  expect(screen.getByText('en el carro')).toBeInTheDocument()
  expect(screen.queryByText('en el carro · Mercadona')).not.toBeInTheDocument()

  // A pending item still names the store it's tagged for (or nothing, if none).
  expect(screen.getByText('pendiente · Mercadona')).toBeInTheDocument()
  expect(screen.getByText('pendiente')).toBeInTheDocument()
})

test('the create preview stays hidden for a plain, prefilled-style name', () => {
  // No sigil: the cleaned name equals the raw input, so there is nothing
  // structured to preview.
  renderBody({ createText: 'Chocolate negro 70%' })
  expect(screen.queryByText('Chocolate negro 70%')).not.toBeInTheDocument()
})

test('the create preview appears once a #marca sigil is recognised', () => {
  // The parser extracts a brand → the preview shows the cleaned name and chip.
  renderBody({ createText: 'Chocolate negro #Valor' })
  expect(screen.getByText('Chocolate negro')).toBeInTheDocument()
  expect(screen.getByText('Valor')).toBeInTheDocument()
})
