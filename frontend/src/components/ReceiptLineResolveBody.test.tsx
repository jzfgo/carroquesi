import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { formatFigure } from '../lib/formatPrice'
import type { ItemRef, LineState, ReceiptLine } from '../lib/receiptReview'
import { ReceiptLineResolveBody } from './ReceiptLineResolveBody'

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
  purchased_quantity: null,
  ean: null,
  bought_by_weight: false,
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
  purchased_quantity: null,
  ean: null,
  bought_by_weight: false,
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
  purchased_quantity: null,
  ean: null,
  bought_by_weight: false,
}

function renderBody(overrides: {
  candidateItems?: ItemRef[]
  createText?: string
  userEdited?: boolean
  suggestions?: Parameters<typeof ReceiptLineResolveBody>[0]['suggestions']
  onPickSuggestion?: Parameters<
    typeof ReceiptLineResolveBody
  >[0]['onPickSuggestion']
}) {
  return render(
    <ReceiptLineResolveBody
      line={line}
      candidateItems={overrides.candidateItems ?? []}
      radioId={null}
      createText={overrides.createText ?? ''}
      userEdited={overrides.userEdited}
      suggestions={overrides.suggestions}
      onPickSuggestion={overrides.onPickSuggestion}
      onSelectRadio={vi.fn()}
      onChangeCreateText={vi.fn()}
      onAssign={vi.fn()}
      onBack={vi.fn()}
      state={undefined}
      onChangeQuantity={vi.fn()}
      onChangePrice={vi.fn()}
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

test('a prefill never filters the link list; typed text does', () => {
  // Prefilled OCR text matches nothing on the list, but the pool stays whole
  // until the user actually types.
  const { rerender } = renderBody({
    candidateItems: [inCart, pendingWithStore, pendingNoStore],
    createText: 'ZZZZ',
    userEdited: false,
  })
  expect(screen.getAllByRole('radio')).toHaveLength(3)

  // Typed text narrows in place, accents folded («leche» finds «Leche»).
  rerender(
    <ReceiptLineResolveBody
      line={line}
      candidateItems={[inCart, pendingWithStore, pendingNoStore]}
      radioId={null}
      createText="léche"
      userEdited
      onSelectRadio={vi.fn()}
      onChangeCreateText={vi.fn()}
      onAssign={vi.fn()}
      onBack={vi.fn()}
      state={undefined}
      onChangeQuantity={vi.fn()}
      onChangePrice={vi.fn()}
    />,
  )
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  expect(screen.getByText('Leche')).toBeInTheDocument()
})

test('catalogue suggestions render above the bar and hand back the pick', async () => {
  const user = userEvent.setup()
  const onPickSuggestion = vi.fn()
  renderBody({
    createText: 'cacahu',
    userEdited: true,
    suggestions: [{ name: 'Cacahuetes fritos', brand: 'Frit', stores: [] }],
    onPickSuggestion,
  })

  const chip = screen.getByRole('button', { name: /Cacahuetes fritos/ })
  expect(chip).toHaveTextContent('Frit')
  await user.click(chip)
  expect(onPickSuggestion).toHaveBeenCalledWith({
    name: 'Cacahuetes fritos',
    brand: 'Frit',
    stores: [],
  })
})

test('the helper link toggles the sigil legend in place', async () => {
  const user = userEvent.setup()
  renderBody({})

  // Collapsed by default: the link is there, the legend is not.
  const link = screen.getByRole('button', {
    name: '¿Cómo escribir más rápido?',
  })
  expect(link).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('#marca')).not.toBeInTheDocument()

  // One tap reveals the three sigils this bar understands.
  await user.click(link)
  expect(link).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('#marca')).toBeInTheDocument()
  expect(screen.getByText('+cantidad')).toBeInTheDocument()
  expect(screen.getByText('"comillas"')).toBeInTheDocument()

  // A second tap folds it back.
  await user.click(link)
  expect(link).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('#marca')).not.toBeInTheDocument()
})

// ── «Cantidad y precio» ────────────────────────────────────────────────────

const chicken: ReceiptLine = {
  receipt_name: 'CONTRAMUSLO DESHUES',
  price_type: 'UNIT',
  unit_price: 3.05,
  quantity: null,
  line_total: 3.05,
}

/** Holds the line's state the way the review does, so edits round-trip. */
function renderDetail(initial?: LineState) {
  const onChangeQuantity = vi.fn()
  const onChangePrice = vi.fn()
  let current = initial
  function Harness() {
    const [state, setState] = useState<LineState | undefined>(initial)
    current = state
    const base = (): LineState =>
      state ?? { included: true, resolution: { kind: 'unassigned' } }
    return (
      <ReceiptLineResolveBody
        line={chicken}
        candidateItems={[]}
        radioId={null}
        createText=""
        onSelectRadio={vi.fn()}
        onChangeCreateText={vi.fn()}
        onAssign={vi.fn()}
        onBack={vi.fn()}
        state={state}
        onChangeQuantity={(q) => {
          onChangeQuantity(q)
          setState({ ...base(), quantity: q, unitPrice: null })
        }}
        onChangePrice={(p, t) => {
          onChangePrice(p, t)
          setState({ ...base(), unitPrice: p, lineTotal: t })
        }}
      />
    )
  }
  render(<Harness />)
  return {
    onChangeQuantity,
    onChangePrice,
    state: () => current,
    qty: () => screen.getByLabelText('Cantidad y precio'),
    price: () => screen.getByLabelText('Precio'),
  }
}

async function retype(el: HTMLElement, text: string) {
  const user = userEvent.setup()
  await user.clear(el)
  if (text) await user.type(el, text)
  await user.tab()
}

test('prefills from the receipt', () => {
  const d = renderDetail()
  expect(d.qty()).toHaveValue('1')
  expect(d.price()).toHaveValue('3,05')
  expect(screen.getByText('/ud')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.queryByText('Importe')).not.toBeInTheDocument()
})

test('quantity change keeps the total', async () => {
  const d = renderDetail()
  await retype(d.qty(), '0,346 kg')
  expect(d.price()).toHaveValue('8,82')
  expect(screen.getByText('/kg')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(d.state()?.lineTotal).toBeUndefined()
})

test('price change corrects the total', async () => {
  const d = renderDetail()
  await retype(d.price(), '3,50')
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('Importe corregido · en el ticket 3,05')
  expect(status).toHaveTextContent('3,50')
})

test("typing the paper's price back clears the correction", async () => {
  const d = renderDetail()
  await retype(d.price(), '3,50')
  await retype(d.price(), '3,05')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(d.onChangePrice).toHaveBeenLastCalledWith(3.05, null)
})

test('blur without edits leaves no correction', async () => {
  const d = renderDetail()
  await retype(d.qty(), '0,346 kg')
  expect(d.price()).toHaveValue('8,82')
  const user = userEvent.setup()
  await user.click(d.price())
  await user.tab()
  expect(d.onChangePrice).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test.each(['', 'kg', 'abc', '0'])(
  'invalid quantity %j reverts',
  async (text) => {
    const d = renderDetail()
    await retype(d.qty(), text)
    expect(d.qty()).toHaveValue('1')
    expect(d.onChangeQuantity).not.toHaveBeenCalled()
  },
)

test("typing the line's own quantity back clears it", async () => {
  const d = renderDetail()
  await retype(d.qty(), '2')
  expect(d.onChangeQuantity).toHaveBeenLastCalledWith('2')
  await retype(d.qty(), '1')
  expect(d.onChangeQuantity).toHaveBeenLastCalledWith(null)
})

test('reopens with overrides', () => {
  const d = renderDetail({
    included: true,
    resolution: { kind: 'unassigned' },
    quantity: '346 g',
    lineTotal: 3.5,
  })
  expect(d.qty()).toHaveValue('346 g')
  expect(d.price()).toHaveValue(formatFigure(3.5 / 0.346))
  expect(screen.getByRole('status')).toBeInTheDocument()
})

test('a typed price stays as typed on a weight', async () => {
  const d = renderDetail()
  await retype(d.qty(), '0,346 kg')
  // 8,80 × 0,346 = 3,0448: the total rounds to 3,04, the price does not.
  await retype(d.price(), '8,80')
  expect(d.price()).toHaveValue('8,80')
  expect(d.state()?.unitPrice).toBe(8.8)
  expect(d.state()?.lineTotal).toBe(3.04)
  expect(screen.getByRole('status')).toHaveTextContent('3,04')
})

test('a quantity change after a typed price keeps the total', async () => {
  const d = renderDetail()
  await retype(d.qty(), '0,346 kg')
  await retype(d.price(), '8,80')
  await retype(d.qty(), '0,5 kg')
  expect(d.price()).toHaveValue('6,08')
  expect(d.state()?.unitPrice).toBeNull()
  expect(d.state()?.lineTotal).toBe(3.04)
})

test('blur on an untouched quantity commits nothing', async () => {
  const d = renderDetail()
  const user = userEvent.setup()
  await user.click(d.qty())
  await user.tab()
  expect(d.onChangeQuantity).not.toHaveBeenCalled()
})

test.each(['346 g', '0,346 kg '])(
  'retyping the same quantity as %j keeps a typed price',
  async (text) => {
    const d = renderDetail()
    await retype(d.qty(), '0,346 kg')
    await retype(d.price(), '8,80')
    await retype(d.qty(), text)
    expect(d.price()).toHaveValue('8,80')
    expect(d.state()?.unitPrice).toBe(8.8)
  },
)
