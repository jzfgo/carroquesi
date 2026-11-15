import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLabel } from '../lib/api'
import { reportRequestOutcome } from '../lib/connectivity'
import type { ItemRef } from '../lib/receiptReview'
import type { LabelRead, ReceiptScanResult } from '../types'
import ReceiptScanSheet from './ReceiptScanSheet'
import { ADD_STORE } from './StoreSelect'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getLabel: vi.fn(),
}))

// The camera is LabelScanner's to test; here a read is a button.
vi.mock('./LabelScanner', () => ({
  LabelScanner: ({
    onDetect,
    onClose,
  }: {
    onDetect: (code: string | null) => void
    onClose: () => void
  }) => (
    <div>
      <button onClick={() => onDetect('230123450063600900005724')}>
        leer etiqueta
      </button>
      <button onClick={onClose}>Cerrar escáner</button>
    </div>
  ),
}))

// The PDF thumb opens ReceiptFileViewer, which loads pdf.js lazily.
vi.mock('../lib/pdfjs', () => ({
  getPdfjs: vi.fn(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 140 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
      destroy: () => undefined,
    }),
  })),
}))

// matched line_totals 1.15 + 2.30 + 2.85 = 6.30; unmatched 3.15 → all-lines 9.45.
function makeResult(
  overrides: Partial<ReceiptScanResult> = {},
): ReceiptScanResult {
  return {
    scan_id: 'scan-1',
    store: 'Mercadona',
    receipt_date: '2026-04-11',
    receipt_total: 9.45,
    target_purchase: null,
    matched: [
      {
        receipt_name: 'BEBIDA ALMENDRAS 0%',
        item_id: 'item-1',
        item_name: 'Bebida de almendra 0% azúcares',
        price_type: 'UNIT',
        unit_price: 1.15,
        quantity: null,
        line_total: 1.15,
      },
      {
        receipt_name: 'BACON LONCHAS',
        item_id: 'item-2',
        item_name: 'Bacon lonchas',
        price_type: 'KILOGRAM',
        unit_price: 11.4,
        quantity: 0.202,
        line_total: 2.3,
      },
      {
        receipt_name: 'YOGUR NATURAL',
        item_id: 'item-3',
        item_name: 'Yogur natural',
        price_type: 'MULTI',
        unit_price: 0.95,
        quantity: 3,
        line_total: 2.85,
      },
    ],
    unmatched: [
      {
        receipt_name: 'MANI DULCE',
        price_type: 'UNIT',
        unit_price: 3.15,
        quantity: null,
        line_total: 3.15,
      },
    ],
    ...overrides,
  }
}

const candidateItems: ItemRef[] = [
  {
    id: 'item-1',
    name: 'Bebida de almendra 0% azúcares',
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
  },
  {
    id: 'item-2',
    name: 'Bacon lonchas',
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
  },
  {
    id: 'item-3',
    name: 'Yogur natural',
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
  },
  {
    id: 'item-4',
    name: 'Maní dulce',
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
  },
]

type SheetProps = Parameters<typeof ReceiptScanSheet>[0]

function renderSheet(overrides: Partial<SheetProps> = {}) {
  const onConfirm = vi.fn<SheetProps['onConfirm']>(async () => true)
  const onClose = vi.fn()
  const onReReadReceipt = vi.fn()
  const showToast = vi.fn()
  render(
    <ReceiptScanSheet
      result={makeResult()}
      candidateItems={candidateItems}
      store="Mercadona"
      getToken={() => Promise.resolve('t')}
      showToast={showToast}
      onConfirm={onConfirm}
      onClose={onClose}
      onReReadReceipt={onReReadReceipt}
      {...overrides}
    />,
  )
  return { onConfirm, onClose, onReReadReceipt, showToast }
}

const saveButton = () => screen.getByRole('button', { name: /Guardar compra/ })
const openRow = (raw: string) =>
  screen.getByRole('button', { name: new RegExp(`^${raw}`) })

describe('ReceiptScanSheet — review list (13a)', () => {
  it('renders one list in ticket order with the raw OCR line as primary', () => {
    renderSheet()
    expect(screen.getByText('BEBIDA ALMENDRAS 0%')).toBeInTheDocument()
    expect(screen.getByText('BACON LONCHAS')).toBeInTheDocument()
    expect(screen.getByText('MANI DULCE')).toBeInTheDocument()
  })

  it('shows matched lines solid (item name) and unmatched as the dashed CTA', () => {
    renderSheet()
    // matched → confirmed name
    expect(
      screen.getByText('Bebida de almendra 0% azúcares'),
    ).toBeInTheDocument()
    // unmatched → dashed "Asignar producto"
    expect(screen.getByText('Asignar producto')).toBeInTheDocument()
  })

  it('checks every line by default', () => {
    renderSheet()
    const checks = screen
      .getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).type === 'checkbox')
    expect(checks).toHaveLength(4)
    checks.forEach((c) => expect(c).toBeChecked())
  })

  it('renders the store and date as set controls', () => {
    renderSheet()
    expect(screen.getByText('Mercadona')).toBeInTheDocument()
    expect(screen.queryByText('Poner fecha')).not.toBeInTheDocument()
    expect(screen.queryByText('Poner tienda')).not.toBeInTheDocument()
  })

  it('shows per-line quantity and price', () => {
    renderSheet()
    expect(screen.getByText('202 g')).toBeInTheDocument()
    expect(screen.getByText('2,85 €')).toBeInTheDocument()
    expect(screen.getByText('3,15 €')).toBeInTheDocument()
  })
})

describe('ReceiptScanSheet — cuadre', () => {
  it('shows the green Total when the line-sum matches the paper', () => {
    renderSheet() // all lines 9.45 === receipt_total 9.45
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.queryByText(/para cuadrar/)).not.toBeInTheDocument()
  })

  it('shows the cuadre card when the line-sum falls short', () => {
    renderSheet({ result: makeResult({ receipt_total: 9.87 }) })
    expect(screen.getByText(/Faltan 0,42 € para cuadrar/)).toBeInTheDocument()
    expect(
      screen.getByText(/Suma de líneas 9,45 € · total leído 9,87 €/),
    ).toBeInTheDocument()
  })

  it('a cuadre that does not match informs, but never blocks the save', () => {
    renderSheet({ result: makeResult({ receipt_total: 9.87 }) })
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    expect(screen.getByText(/para cuadrar/)).toBeInTheDocument()
    expect(
      screen.queryByText(/para guardar esta compra/),
    ).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('shows a signed overshoot when the line-sum exceeds the paper', () => {
    renderSheet({ result: makeResult({ receipt_total: 9.0 }) })
    expect(screen.getByText(/Sobran 0,45 € para cuadrar/)).toBeInTheDocument()
  })

  it('keeps the cuadre green from all lines while the button saves only checked', () => {
    renderSheet() // 9.45 total
    // Uncheck the unmatched bag (3.15) — it still counts toward the cuadre.
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    // Disc stays on the matched total; no mismatch card.
    expect(screen.queryByText(/para cuadrar/)).not.toBeInTheDocument()
    // Button now saves the smaller checked sum 6.30.
    expect(saveButton()).toHaveTextContent('6,30')
  })
})

describe('ReceiptScanSheet — save gating', () => {
  it('blocks save while a checked line is still unnamed', () => {
    renderSheet()
    // MANI DULCE is checked but unassigned → disabled, and the warning says so.
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText(/para guardar esta compra/)).toHaveTextContent(
      'Asigna un producto a 1 línea para guardar esta compra',
    )
  })

  it('enables save once the unnamed line is unchecked', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    expect(saveButton()).toBeEnabled()
    expect(
      screen.queryByText(/para guardar esta compra/),
    ).not.toBeInTheDocument()
  })

  it('blocks save without a date', () => {
    renderSheet({ result: makeResult({ receipt_date: null }) })
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    expect(screen.getByText('Poner fecha')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText(/para guardar esta compra/)).toHaveTextContent(
      'Indica la fecha para guardar esta compra',
    )
  })

  it('blocks save without a store', () => {
    renderSheet({
      store: null,
      result: makeResult({ store: null }),
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    expect(screen.getByText('Poner tienda')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText(/para guardar esta compra/)).toHaveTextContent(
      'Indica la tienda para guardar esta compra',
    )
  })

  it('names everything missing in one warning', () => {
    renderSheet({
      store: null,
      result: makeResult({ store: null, receipt_date: null }),
    })
    expect(screen.getByText(/para guardar esta compra/)).toHaveTextContent(
      'Indica la tienda y la fecha y asigna un producto a 1 línea para guardar esta compra',
    )
  })

  it('the head checkbox clears every line and disables save', () => {
    renderSheet()
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Deseleccionar todo' }),
    )
    const checks = screen
      .getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).type === 'checkbox')
    checks.forEach((c) => expect(c).not.toBeChecked())
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText(/para guardar esta compra/)).toHaveTextContent(
      'Marca al menos una línea para guardar esta compra',
    )
  })

  it('offers the list stores in the store pill, and «+ otra» adds one', () => {
    renderSheet({
      store: null,
      result: makeResult({ store: null }),
      storeOptions: ['Lidl', 'Mercadona'],
    })
    const pill = screen.getByRole('combobox', { name: 'Tienda' })
    fireEvent.change(pill, { target: { value: 'Lidl' } })
    expect(pill).toHaveValue('Lidl')

    // «+ otra» swaps in the «Nueva tienda» step, in the same sheet.
    fireEvent.change(pill, { target: { value: ADD_STORE } })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.change(screen.getByPlaceholderText('Nombre de la tienda'), {
      target: { value: 'Frutería Paqui' },
    })
    fireEvent.click(screen.getByText('Usar esta tienda'))
    expect(screen.getByRole('combobox', { name: 'Tienda' })).toHaveValue(
      'Frutería Paqui',
    )
  })

  it('the date pill sets the receipt date', () => {
    renderSheet({ result: makeResult({ receipt_date: null }) })
    fireEvent.change(screen.getByLabelText('Fecha'), {
      target: { value: '2026-07-14' },
    })
    expect(screen.queryByText('Poner fecha')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-07-14')
  })
})

describe('ReceiptScanSheet — save payload', () => {
  it('sends patches for matched lines and the date/store meta', async () => {
    const { onConfirm } = renderSheet()
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches, mappings, newItems, meta] = onConfirm.mock.calls[0]
    expect(patches).toHaveLength(3)
    expect(patches[0]).toMatchObject({ item_id: 'item-1', price: 1.15 })
    expect(patches.find((p) => p.item_id === 'item-2')).toMatchObject({
      price_per: 'KILOGRAM',
      quantity: '202g',
    })
    expect(newItems).toHaveLength(0)
    expect(mappings).toHaveLength(3)
    expect(mappings[0]).toMatchObject({
      store: 'Mercadona',
      receipt_name: 'BEBIDA ALMENDRAS 0%',
      item_name: 'Bebida de almendra 0% azúcares',
    })
    expect(meta).toEqual({ receiptDate: '2026-04-11', store: 'Mercadona' })
  })

  it('re-enables save when the submit resolves false', async () => {
    renderSheet({
      onConfirm: vi.fn<SheetProps['onConfirm']>(async () => false),
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveButton()).toBeEnabled())
  })
})

describe('ReceiptScanSheet — re-read', () => {
  it('"Volver a leer el ticket" calls onReReadReceipt', () => {
    const { onReReadReceipt } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /Volver a leer/ }))
    expect(onReReadReceipt).toHaveBeenCalledTimes(1)
  })
})

describe('ReceiptScanSheet — thumbnail', () => {
  it('renders an image thumbnail when given an imageUrl', () => {
    renderSheet({ imageUrl: 'blob:fake' })
    expect(
      screen.getByRole('button', { name: 'Ampliar la foto del ticket' }),
    ).toBeInTheDocument()
  })

  it('shows a static PDF badge when the file URL is missing', () => {
    renderSheet({ imageUrl: null, isPdf: true })
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ampliar el ticket' }),
    ).not.toBeInTheDocument()
  })

  it('prints the page count on the PDF badge when it has several', () => {
    renderSheet({ imageUrl: 'blob:fake', isPdf: true, pdfPages: 3 })
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(screen.getByText('3 pág.')).toBeInTheDocument()
  })

  it('omits the count on a single-page or uncounted PDF', () => {
    renderSheet({ imageUrl: 'blob:fake', isPdf: true, pdfPages: null })
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(screen.queryByText(/pág\./)).not.toBeInTheDocument()
  })

  it('omits the count when the PDF has exactly one page', () => {
    renderSheet({ imageUrl: 'blob:fake', isPdf: true, pdfPages: 1 })
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(screen.queryByText(/pág\./)).not.toBeInTheDocument()
  })

  it('tapping the PDF thumb opens the pager on the file', async () => {
    renderSheet({ imageUrl: 'blob:fake-pdf', isPdf: true, pdfPages: 3 })
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar el ticket' }))
    // The shared viewer opens as a dialog and lays the pages on the track.
    const dialog = await screen.findByRole('dialog', { name: 'Ticket' })
    await waitFor(() =>
      expect(dialog.querySelectorAll('.rfv__page')).toHaveLength(3),
    )
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })
})

// The named purchase's own lines, prices included: item-1 unpriced (fill),
// item-2 already at the paper's price (no-op), item-3 priced differently
// (correction). MANI DULCE stays unmatched → a new line if resolved.
const targetItems: ItemRef[] = [
  { ...candidateItems[0], price: null, price_per: null },
  {
    ...candidateItems[1],
    price: 11.4,
    price_per: 'KILOGRAM',
    purchased_quantity: '202g',
  },
  { ...candidateItems[2], price: 1.2, price_per: null },
]

const target = {
  purchaseId: 'trip-1',
  store: 'Mercadona',
  date: '2026-04-11',
  total: 9.45,
}

function renderTargeted(overrides: Partial<SheetProps> = {}) {
  return renderSheet({
    candidateItems: targetItems,
    target,
    ...overrides,
  })
}

describe('ReceiptScanSheet — targeted attach (25b)', () => {
  it('titles the review as completing the purchase', () => {
    renderTargeted()
    expect(
      screen.getByRole('heading', { name: 'Añadir ticket a esta compra' }),
    ).toBeInTheDocument()
  })

  it('locks the store and date pills to the record', () => {
    renderTargeted()
    // Locked pills are ink, not controls: neither sits inside a button.
    expect(screen.getByText('Mercadona').closest('button')).toBeNull()
    const dateEl = document.querySelectorAll('.psheet-pill--locked')[1]
    expect(dateEl?.closest('button')).toBeNull()
    expect(document.querySelectorAll('.psheet-pill--locked')).toHaveLength(2)
  })

  it('keeps the store pill editable when the purchase has none', () => {
    renderTargeted({ target: { ...target, store: null }, store: 'Lidl' })
    // Seeded from the parse/list and still a control.
    expect(screen.getByRole('combobox', { name: 'Tienda' })).toHaveValue('Lidl')
  })

  it('annotates each line as fill, correction, or no-op', () => {
    renderTargeted()
    expect(screen.getByText('completa el precio')).toBeInTheDocument()
    expect(screen.getByText('era 1,20 €/UD')).toBeInTheDocument()
    // The no-op line starts unchecked, so it reads «no se guarda»; checking
    // it back on surfaces the reason a save would change nothing.
    fireEvent.click(screen.getByRole('checkbox', { name: /BACON LONCHAS/ }))
    expect(screen.getByText('sin cambios')).toBeInTheDocument()
  })

  it('starts a no-op line unchecked so the save counts stay honest', () => {
    renderTargeted()
    expect(
      screen.getByRole('checkbox', { name: /BACON LONCHAS/ }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: /BEBIDA ALMENDRAS/ }),
    ).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /YOGUR/ })).toBeChecked()
  })

  it('announces a differing paper total before it replaces the recorded one', () => {
    renderTargeted({ target: { ...target, total: 10 } })
    expect(
      screen.getByText(/El total guardado pasa de 10,00 € a 9,45 €/),
    ).toBeInTheDocument()
  })

  it('says nothing about the total when the paper agrees', () => {
    renderTargeted()
    expect(screen.queryByText(/El total guardado/)).not.toBeInTheDocument()
  })

  it('confirm meta carries the locked store and date', async () => {
    const { onConfirm } = renderTargeted()
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [, , , meta] = onConfirm.mock.calls[0]
    expect(meta).toEqual({ receiptDate: '2026-04-11', store: 'Mercadona' })
  })
})

describe('ReceiptScanSheet — targeted resolve (JAV-232)', () => {
  // MANI DULCE is on the trip as «Cacahuetes garrapiñados»: the matcher
  // pairs by name and misses it. The trip also holds another unpaired line.
  const partner: ItemRef = {
    ...candidateItems[3],
    id: 'item-4',
    name: 'Cacahuetes garrapiñados',
    purchased: true,
    purchased_at: '2026-04-11T15:00:00',
    price: 3.15,
    price_per: null,
  }
  const other: ItemRef = {
    ...partner,
    id: 'item-5',
    name: 'Pipas',
    price: 1.1,
  }

  it('preselects the trip line at the same price, so «Asignar» links it', async () => {
    const { onConfirm } = renderTargeted({
      candidateItems: [...targetItems, partner, other],
    })
    fireEvent.click(openRow('MANI DULCE'))
    expect(screen.getByText(/En esta compra/)).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /Cacahuetes garrapiñados/ }),
    ).toBeChecked()
    // The sub-label is the recorded price, which is how the partner reads.
    expect(screen.getByText('3,15 €/UD')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches, , newItems] = onConfirm.mock.calls[0]
    expect(newItems).toHaveLength(0)
    expect(patches.some((p) => p.item_id === 'item-4')).toBe(true)
  })

  it('does not guess the only unpaired line when the price says nothing', () => {
    // It may be a product nobody ticked: a wrong link would overwrite a
    // correct price and lose the new spend.
    for (const price of [null, 2]) {
      const { unmount } = render(
        <ReceiptScanSheet
          result={makeResult()}
          candidateItems={[...targetItems, { ...partner, price }]}
          store="Mercadona"
          getToken={() => Promise.resolve('t')}
          showToast={vi.fn()}
          target={target}
          onConfirm={vi.fn(async () => true)}
          onClose={vi.fn()}
          onReReadReceipt={vi.fn()}
        />,
      )
      fireEvent.click(openRow('MANI DULCE'))
      expect(
        screen.getByRole('radio', { name: /Cacahuetes garrapiñados/ }),
      ).not.toBeChecked()
      unmount()
    }
  })

  it('does not guess a line at the same unit price but another quantity', () => {
    // The patch writes the quantity too: linking 1 × 3,15 onto a record of
    // 4 × 3,15 would cut its amount and lose the new product's spend.
    renderTargeted({
      candidateItems: [...targetItems, { ...partner, purchased_quantity: '4' }],
    })
    fireEvent.click(openRow('MANI DULCE'))
    expect(
      screen.getByRole('radio', { name: /Cacahuetes garrapiñados/ }),
    ).not.toBeChecked()
  })

  it('notes a quantity correction even when the price repeats', () => {
    // YOGUR prints 3 × 0,95; the record holds 0,95 × 2.
    renderTargeted({
      candidateItems: [
        targetItems[0],
        targetItems[1],
        { ...targetItems[2], price: 0.95, purchased_quantity: '2' },
      ],
    })
    expect(screen.getByText('era 2 UD')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /YOGUR/ })).toBeChecked()
  })

  it('names the implied quantity when the record holds none', () => {
    // Same prices as the paper, no quantity recorded: the note must not
    // repeat the unchanged price.
    renderTargeted({
      candidateItems: [
        targetItems[0],
        { ...targetItems[1], purchased_quantity: null },
        { ...targetItems[2], price: 0.95 },
      ],
    })
    expect(screen.getByText('era 1 UD')).toBeInTheDocument()
    expect(screen.getByText('completa el peso')).toBeInTheDocument()
    expect(screen.queryByText(/era 0,95 €|era 11,40 €/)).not.toBeInTheDocument()
  })

  it('guesses nothing when no single line stands out', () => {
    renderTargeted({
      candidateItems: [
        ...targetItems,
        { ...partner, price: 2 },
        { ...other, price: 1.1 },
      ],
    })
    fireEvent.click(openRow('MANI DULCE'))
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked()
    }
    // With no guess, the bar keeps the raw line as its prefill.
    expect(screen.getByPlaceholderText(/Nombre del producto/)).toHaveValue(
      'MANI DULCE',
    )
  })

  it('typing a name still creates a new line when the user insists', async () => {
    const { onConfirm } = renderTargeted({
      candidateItems: [...targetItems, partner],
    })
    fireEvent.click(openRow('MANI DULCE'))
    fireEvent.change(screen.getByPlaceholderText(/Nombre del producto/), {
      target: { value: 'Maní dulce' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches, , newItems] = onConfirm.mock.calls[0]
    expect(newItems).toEqual([expect.objectContaining({ name: 'Maní dulce' })])
    expect(patches.some((p) => p.item_id === 'item-4')).toBe(false)
  })
})

describe('ReceiptScanSheet — resolve sheet (13b)', () => {
  it('opens the resolve sub-view with the raw line as fixed truth', () => {
    renderSheet()
    fireEvent.click(openRow('MANI DULCE'))
    expect(screen.getByText('Línea del ticket')).toBeInTheDocument()
    expect(screen.getByText('Revisar ticket')).toBeInTheDocument() // back galón
    // The line's qty·price shown read-only.
    expect(screen.getByText('1 · 3,15 €')).toBeInTheDocument()
  })

  it('links a line to a pending item via the radio list', async () => {
    const { onConfirm } = renderSheet()
    fireEvent.click(openRow('MANI DULCE'))
    // Only item-4 is free (1–3 are already matched).
    fireEvent.click(screen.getByRole('radio', { name: /Maní dulce/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    // Back on the list, the row is now solid with the linked name.
    expect(screen.getAllByText('Maní dulce').length).toBeGreaterThan(0)
    expect(screen.queryByText('Asignar producto')).not.toBeInTheDocument()
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    expect(patches).toHaveLength(4)
    expect(patches.some((p) => p.item_id === 'item-4')).toBe(true)
  })

  it('creates a new item from the smart bar', async () => {
    const { onConfirm } = renderSheet()
    fireEvent.click(openRow('MANI DULCE'))
    const input = screen.getByPlaceholderText(/Nombre del producto/)
    fireEvent.change(input, { target: { value: 'Cacahuete dulce #Frit' } })
    // The parse preview shows the clean name and brand chip.
    expect(screen.getByText('Cacahuete dulce')).toBeInTheDocument()
    expect(screen.getByText('Frit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [, , newItems] = onConfirm.mock.calls[0]
    expect(newItems).toHaveLength(1)
    expect(newItems[0]).toMatchObject({
      name: 'Cacahuete dulce',
      brand: 'Frit',
      price: 3.15,
    })
  })

  it('the back galón returns to the list without resolving', () => {
    renderSheet()
    fireEvent.click(openRow('MANI DULCE'))
    fireEvent.click(screen.getByRole('button', { name: /Revisar ticket/ }))
    // Back on the list; the line is still the dashed CTA.
    expect(screen.getByText('Asignar producto')).toBeInTheDocument()
    expect(screen.queryByText('Línea del ticket')).not.toBeInTheDocument()
  })

  it('typing fetches catalogue suggestions and a tap prefills the bar', async () => {
    const onFetchSuggestions = vi.fn(async () => [
      { name: 'Cacahuetes fritos', brand: 'El Corte Inglés', stores: [] },
    ])
    renderSheet({ onFetchSuggestions })
    fireEvent.click(openRow('MANI DULCE'))
    // The prefilled OCR line alone never searches.
    expect(onFetchSuggestions).not.toHaveBeenCalled()

    const input = screen.getByPlaceholderText(/Nombre del producto/)
    fireEvent.change(input, { target: { value: 'Cacahu' } })
    const chip = await screen.findByRole('button', {
      name: /Cacahuetes fritos/,
    })
    expect(onFetchSuggestions).toHaveBeenCalledWith('Cacahu')

    // The pick is a prefill: the bar takes name + quoted #marca and the
    // strip retires until the user types again.
    fireEvent.click(chip)
    expect(
      screen.getByDisplayValue('Cacahuetes fritos #"El Corte Inglés"'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Cacahuetes fritos/ }),
    ).not.toBeInTheDocument()
  })

  it('typing filters the link list in place and a filtered item still links', () => {
    renderSheet()
    fireEvent.click(openRow('MANI DULCE'))
    // Only item-4 is free; the prefilled raw line does not hide it.
    expect(
      screen.getByRole('radio', { name: /Maní dulce/ }),
    ).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/Nombre del producto/)
    fireEvent.change(input, { target: { value: 'chocolate' } })
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    // Accent-insensitive: «mani» finds «Maní dulce», and the row still links.
    fireEvent.change(input, { target: { value: 'mani' } })
    fireEvent.click(screen.getByRole('radio', { name: /Maní dulce/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    expect(screen.getAllByText('Maní dulce').length).toBeGreaterThan(0)
  })

  it('a barcode scan fills the create bar for its row', () => {
    renderSheet({
      pendingScan: {
        index: 3,
        product: {
          ean: '8410000000123',
          name: 'Cacahuetes',
          brand: 'Frit',
          stores: [],
        },
      },
    })
    // The resolve view opens for the scanned row with the create bar filled.
    expect(screen.getByText('Línea del ticket')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cacahuetes #Frit')).toBeInTheDocument()
  })
})

describe('ReceiptScanSheet — discount lines (JAV-184)', () => {
  // A promo Gemini failed to fold: negative, still on the paper. The paper
  // total already carries the discount (9.45 − 1.20).
  const withPromo = () =>
    makeResult({
      receipt_total: 8.25,
      unmatched: [
        ...makeResult().unmatched,
        {
          receipt_name: 'PROMOCION',
          price_type: 'UNIT',
          unit_price: -1.2,
          quantity: null,
          line_total: -1.2,
        },
      ],
    })

  it('renders the promo locked: unchecked, disabled, no door to resolve', () => {
    renderSheet({ result: withPromo() })
    const check = screen.getByRole('checkbox', { name: /PROMOCION/ })
    expect(check).not.toBeChecked()
    expect(check).toBeDisabled()
    expect(screen.getByText('descuento · no se guarda')).toBeInTheDocument()
    expect(openRow('PROMOCION')).toBeDisabled()
  })

  it('keeps the promo in the cuadre sum, so the paper still squares', () => {
    renderSheet({ result: withPromo() })
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('select-all skips the promo and the payload never carries it', async () => {
    const { onConfirm } = renderSheet({ result: withPromo() })
    // Every selectable line starts checked, so the locked promo alone does not
    // keep the toggle from reading as complete.
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Deseleccionar todo' }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todo' }))
    expect(
      screen.getByRole('checkbox', { name: /PROMOCION/ }),
    ).not.toBeChecked()
    // The promo is unnamed but locked, so it neither blocks the save nor
    // reaches the payload.
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches, , newItems] = onConfirm.mock.calls[0]
    expect(patches).toHaveLength(3)
    expect(newItems).toHaveLength(0)
  })
})

describe('ReceiptScanSheet — price correction (JAV-185)', () => {
  it('a corrected line total flows into the row, the sums, and the payload', async () => {
    const { onConfirm } = renderSheet()
    // Open the MULTI line (3 × 0,95 = 2,85) and correct its price to 0,60.
    fireEvent.click(openRow('YOGUR NATURAL'))
    const input = screen.getByLabelText('Precio')
    expect(input).toHaveValue('0,95')
    fireEvent.change(input, { target: { value: '0,60' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByRole('button', { name: /Revisar ticket/ }))

    // The row prints the corrected total, 3 × 0,60.
    expect(screen.getByText('1,80 €')).toBeInTheDocument()
    // Save: the recorded unit price re-derives from the corrected total.
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    const yogur = patches.find((p) => p.item_id === 'item-3')
    expect(yogur?.price).toBeCloseTo(0.6)
  })

  it("an uncorrected line keeps the parse's own unit price", async () => {
    const { onConfirm } = renderSheet()
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    expect(patches.find((p) => p.item_id === 'item-2')?.price).toBe(11.4)
  })
})

describe('ReceiptScanSheet — quantity correction', () => {
  function setQuantity(raw: string, text: string) {
    fireEvent.click(openRow(raw))
    const qty = screen.getByLabelText('Cantidad y precio')
    fireEvent.change(qty, { target: { value: text } })
    fireEvent.blur(qty)
    fireEvent.click(
      screen.getByRole('button', { name: /Revisar ticket|Añadir ticket/ }),
    )
  }

  it('saves the corrected quantity', async () => {
    const { onConfirm } = renderSheet()
    // BEBIDA ALMENDRAS reads 1 × 1,15; it was really 346 g.
    setQuantity('BEBIDA ALMENDRAS', '346 g')
    expect(screen.getByText('346 g')).toBeInTheDocument()
    expect(screen.getByText('1,15 €')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    const bebida = patches.find((p) => p.item_id === 'item-1')
    expect(bebida).toMatchObject({ quantity: '346 g', price_per: 'KILOGRAM' })
    expect(bebida?.price).toBeCloseTo(1.15 / 0.346)
  })

  it('saves a typed price as typed', async () => {
    const { onConfirm } = renderSheet()
    fireEvent.click(openRow('BEBIDA ALMENDRAS'))
    const qty = screen.getByLabelText('Cantidad y precio')
    fireEvent.change(qty, { target: { value: '346 g' } })
    fireEvent.blur(qty)
    const price = screen.getByLabelText('Precio')
    fireEvent.change(price, { target: { value: '3,30' } })
    fireEvent.blur(price)
    fireEvent.click(
      screen.getByRole('button', { name: /Revisar ticket|Añadir ticket/ }),
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    const bebida = patches.find((p) => p.item_id === 'item-1')
    // 3,30 × 0,346 = 1,1418 → 1,14; dividing back would give 3,2948.
    expect(bebida?.price).toBe(3.3)
  })

  it('targeted: a quantity change reads the old price', () => {
    renderTargeted({
      candidateItems: [
        { ...targetItems[0], price: 1.15, purchased_quantity: '1' },
        targetItems[1],
        targetItems[2],
      ],
    })
    setQuantity('BEBIDA ALMENDRAS', '2')
    const box = screen.getByRole('checkbox', { name: /BEBIDA ALMENDRAS/ })
    if (!(box as HTMLInputElement).checked) fireEvent.click(box)
    // The total stays 1,15, so the unit price moves to 0,575: the price note
    // wins over the quantity one.
    expect(screen.getByText('era 1,15 €/UD')).toBeInTheDocument()
  })
})

describe('ReceiptScanSheet — weighed label', () => {
  // 346 g at 3,32 €/kg is 1,15: the BEBIDA ALMENDRAS line's own total.
  const LABEL: LabelRead = {
    format: 'mercadona-24',
    article: '01234',
    reduced: false,
    weight_g: 346,
    price_per_kg_cents: 332,
    total_cents: 115,
    chain: 'Mercadona',
  }
  const chip = (raw: string) =>
    screen.queryByRole('button', { name: `Escanear la etiqueta de «${raw}»` })

  afterEach(() => {
    reportRequestOutcome(true)
  })

  it('offers «Peso» on one-unit lines with no EAN, not on weighed or counted ones', () => {
    renderSheet()
    expect(chip('BEBIDA ALMENDRAS 0%')).toBeInTheDocument()
    expect(chip('MANI DULCE')).toBeInTheDocument()
    expect(chip('BACON LONCHAS')).not.toBeInTheDocument()
    expect(chip('YOGUR NATURAL')).not.toBeInTheDocument()
  })

  it('offers nothing where the labels give no weight', () => {
    renderSheet({
      store: 'Ahorramas',
      result: makeResult({ store: 'Ahorramas' }),
    })
    expect(chip('BEBIDA ALMENDRAS 0%')).not.toBeInTheDocument()
  })

  it('a product with an EAN needs a past weighed purchase', () => {
    renderSheet({
      candidateItems: [
        { ...candidateItems[0], ean: '8480000123456' },
        candidateItems[1],
        { ...candidateItems[2], ean: '8480000654321', bought_by_weight: true },
        candidateItems[3],
      ],
    })
    expect(chip('BEBIDA ALMENDRAS 0%')).not.toBeInTheDocument()
    expect(chip('YOGUR NATURAL')).toBeInTheDocument()
  })

  it('a used label gives the line its weight and €/kg, and keeps the paper amount', async () => {
    vi.mocked(getLabel).mockResolvedValue(LABEL)
    const { onConfirm } = renderSheet()
    fireEvent.click(chip('BEBIDA ALMENDRAS 0%')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Usar en esta línea' }),
    )
    expect(screen.getByText('0,346 kg')).toBeInTheDocument()
    expect(screen.getByText('1,15 €')).toBeInTheDocument()
    expect(chip('BEBIDA ALMENDRAS 0%')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    expect(patches.find((p) => p.item_id === 'item-1')).toMatchObject({
      quantity: '0,346 kg',
      price: 3.32,
      price_per: 'KILOGRAM',
      article: '01234',
    })
    expect(patches.find((p) => p.item_id === 'item-2')?.article).toBeNull()
    // A label read here speaks for the line; without one the patch says
    // nothing, so a line closed with a reduced label keeps its mark.
    expect(patches.find((p) => p.item_id === 'item-1')).toMatchObject({
      reduced: false,
      price_before: null,
    })
    expect(patches.find((p) => p.item_id === 'item-2')).not.toHaveProperty(
      'reduced',
    )
  })

  it('a reduced label marks the patch and sends the old €/kg', async () => {
    vi.mocked(getLabel).mockResolvedValue({ ...LABEL, reduced: true })
    const { onConfirm } = renderSheet()
    fireEvent.click(chip('BEBIDA ALMENDRAS 0%')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.change(await screen.findByLabelText('Precio anterior'), {
      target: { value: '1,50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Usar en esta línea' }))

    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    const patch = patches.find((p) => p.item_id === 'item-1')!
    expect(patch.reduced).toBe(true)
    expect(patch.price_before).toBeCloseTo(1.5 / 0.346, 6)
  })

  it('a label used despite a mismatch keeps the paper amount', async () => {
    // 400 g at 3,32 €/kg is 1,33; the paper says 1,15.
    vi.mocked(getLabel).mockResolvedValue({
      ...LABEL,
      weight_g: 400,
      total_cents: 133,
    })
    const { onConfirm } = renderSheet()
    fireEvent.click(chip('BEBIDA ALMENDRAS 0%')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Usarla de todas formas' }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    const patch = patches.find((p) => p.item_id === 'item-1')!
    expect(patch).toMatchObject({
      quantity: '0,4 kg',
      price_per: 'KILOGRAM',
      article: '01234',
    })
    // Weight × price is the paper's 1,15, not the label's 1,33.
    expect(0.4 * patch.price!).toBeCloseTo(1.15, 2)
  })

  it('a label that matches a corrected total keeps that total', async () => {
    // The paper reads 1,15; the user corrects it to 2,00, which the label
    // agrees with: 346 g at 5,78 €/kg.
    vi.mocked(getLabel).mockResolvedValue({
      ...LABEL,
      price_per_kg_cents: 578,
      total_cents: 200,
    })
    const { onConfirm } = renderSheet()
    fireEvent.click(openRow('BEBIDA ALMENDRAS'))
    const input = screen.getByLabelText('Precio')
    fireEvent.change(input, { target: { value: '2,00' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByRole('button', { name: 'Escanear etiqueta' }))
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Usar en esta línea' }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Revisar ticket/ }))
    expect(screen.getByText('2,00 €')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [patches] = onConfirm.mock.calls[0]
    const patch = patches.find((p) => p.item_id === 'item-1')!
    expect(patch.quantity).toBe('0,346 kg')
    expect(0.346 * patch.price!).toBeCloseTo(2, 2)
  })

  it('a created line carries the label too', async () => {
    vi.mocked(getLabel).mockResolvedValue({ ...LABEL, total_cents: 315 })
    const { onConfirm } = renderSheet()
    fireEvent.click(chip('MANI DULCE')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Usar en esta línea' }),
    )
    fireEvent.click(openRow('MANI DULCE'))
    fireEvent.change(screen.getByPlaceholderText(/Nombre del producto/), {
      target: { value: 'Maní dulce' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const [, , newItems] = onConfirm.mock.calls[0]
    expect(newItems[0]).toMatchObject({ name: 'Maní dulce', article: '01234' })
  })

  it('the same label on a second line warns', async () => {
    vi.mocked(getLabel).mockResolvedValue(LABEL)
    renderSheet()
    fireEvent.click(chip('BEBIDA ALMENDRAS 0%')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Usar en esta línea' }),
    )
    fireEvent.click(chip('MANI DULCE')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    expect(
      await screen.findByText(
        /Esta etiqueta ya está en otra línea de Bebida de almendra 0% azúcares\./,
      ),
    ).toBeInTheDocument()
  })

  it('an unchecked line does not count as the label’s other line', async () => {
    vi.mocked(getLabel).mockResolvedValue(LABEL)
    renderSheet()
    fireEvent.click(chip('BEBIDA ALMENDRAS 0%')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Usar en esta línea' }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /BEBIDA ALMENDRAS/ }))
    fireEvent.click(chip('MANI DULCE')!)
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    await screen.findByRole('button', { name: /Usar/ })
    expect(screen.queryByText(/ya está en otra línea/)).not.toBeInTheDocument()
  })

  it('the line detail always offers the scan, and «Escribir a mano» returns there', async () => {
    vi.mocked(getLabel).mockResolvedValue(null)
    renderSheet()
    fireEvent.click(openRow('YOGUR NATURAL'))
    fireEvent.click(screen.getByRole('button', { name: 'Escanear etiqueta' }))
    fireEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Escribir a mano' }),
    )
    expect(screen.getByLabelText('Cantidad y precio')).toBeInTheDocument()
    expect(screen.getByText('YOGUR NATURAL')).toBeInTheDocument()
  })

  it('closing the camera goes back to where the scan began', () => {
    renderSheet()
    fireEvent.click(chip('BEBIDA ALMENDRAS 0%')!)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }))
    expect(saveButton()).toBeInTheDocument()
  })

  it('offline, the chip refuses with the offline toast', () => {
    const { showToast } = renderSheet()
    reportRequestOutcome(false)
    fireEvent.click(chip('BEBIDA ALMENDRAS 0%')!)
    expect(showToast).toHaveBeenCalledWith('Sin conexión')
    expect(
      screen.queryByRole('button', { name: 'leer etiqueta' }),
    ).not.toBeInTheDocument()
  })
})
