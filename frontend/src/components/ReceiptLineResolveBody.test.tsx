import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  userEdited?: boolean
  suggestions?: Parameters<typeof ReceiptLineResolveBody>[0]['suggestions']
  onPickSuggestion?: Parameters<
    typeof ReceiptLineResolveBody
  >[0]['onPickSuggestion']
  effectiveTotal?: number
  onChangePrice?: (value: number | null) => void
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
      effectiveTotal={overrides.effectiveTotal ?? line.line_total}
      onChangePrice={overrides.onChangePrice ?? vi.fn()}
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
      effectiveTotal={line.line_total}
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

// ── The Importe correction (JAV-185) ─────────────────────────────────────────

test('the Importe field prefills the effective total, comma-decimal', () => {
  renderBody({ effectiveTotal: 4.58 })
  expect(screen.getByLabelText('Importe')).toHaveValue('4,58')
})

test('a corrected amount commits on blur, comma accepted', async () => {
  const user = userEvent.setup()
  const onChangePrice = vi.fn()
  renderBody({ onChangePrice })

  const input = screen.getByLabelText('Importe')
  await user.clear(input)
  await user.type(input, '3,38')
  await user.tab()
  expect(onChangePrice).toHaveBeenCalledWith(3.38)
  expect(input).toHaveValue('3,38')
})

test('typing the read figure back clears the correction', async () => {
  const user = userEvent.setup()
  const onChangePrice = vi.fn()
  // A correction is in force (2,00); the paper read 3,18.
  renderBody({ effectiveTotal: 2, onChangePrice })

  const input = screen.getByLabelText('Importe')
  await user.clear(input)
  await user.type(input, '3,18')
  await user.tab()
  expect(onChangePrice).toHaveBeenCalledWith(null)
})

test('an invalid or negative amount reverts instead of committing', async () => {
  const user = userEvent.setup()
  const onChangePrice = vi.fn()
  renderBody({ effectiveTotal: 4.58, onChangePrice })

  const input = screen.getByLabelText('Importe')
  await user.clear(input)
  await user.type(input, '-2')
  await user.tab()
  expect(onChangePrice).not.toHaveBeenCalled()
  expect(input).toHaveValue('4,58')
})
