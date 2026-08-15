import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReceiptScanResult } from '../types'
import ReceiptScanSheet, { type ItemRef } from './ReceiptScanSheet'

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
  },
]

type SheetProps = Parameters<typeof ReceiptScanSheet>[0]

function renderSheet(overrides: Partial<SheetProps> = {}) {
  const onConfirm = vi.fn<SheetProps['onConfirm']>(async () => true)
  const onClose = vi.fn()
  const onReReadReceipt = vi.fn()
  render(
    <ReceiptScanSheet
      result={makeResult()}
      candidateItems={candidateItems}
      store="Mercadona"
      onConfirm={onConfirm}
      onClose={onClose}
      onReReadReceipt={onReReadReceipt}
      {...overrides}
    />,
  )
  return { onConfirm, onClose, onReReadReceipt }
}

const saveButton = () => screen.getByRole('button', { name: /Guardar compra/ })
const openRow = (raw: string) =>
  screen.getByRole('button', { name: new RegExp(raw) })

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
    expect(screen.getByText('2,85')).toBeInTheDocument()
    expect(screen.getByText('3,15')).toBeInTheDocument()
  })
})

describe('ReceiptScanSheet — cuadre', () => {
  it('shows the green Total when the line-sum matches the paper', () => {
    renderSheet() // all lines 9.45 === receipt_total 9.45
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.queryByText(/para cuadrar/)).not.toBeInTheDocument()
  })

  it('shows the amber diff card when the line-sum falls short', () => {
    renderSheet({ result: makeResult({ receipt_total: 9.87 }) })
    expect(screen.getByText(/Faltan € 0,42 para cuadrar/)).toBeInTheDocument()
    expect(
      screen.getByText(/Suma de líneas 9,45 · total leído 9,87/),
    ).toBeInTheDocument()
  })

  it('shows a signed overshoot when the line-sum exceeds the paper', () => {
    renderSheet({ result: makeResult({ receipt_total: 9.0 }) })
    expect(screen.getByText(/Sobran € 0,45 para cuadrar/)).toBeInTheDocument()
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
    // MANI DULCE is checked but unassigned → disabled.
    expect(saveButton()).toBeDisabled()
  })

  it('enables save once the unnamed line is unchecked', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    expect(saveButton()).toBeEnabled()
  })

  it('blocks save without a date', () => {
    renderSheet({ result: makeResult({ receipt_date: null }) })
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    expect(screen.getByText('Poner fecha')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('blocks save without a store', () => {
    renderSheet({
      store: null,
      result: makeResult({ store: null }),
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /MANI DULCE/ }))
    expect(screen.getByText('Poner tienda')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('"Quitar todas" clears every line and disables save', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todas' }))
    const checks = screen
      .getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).type === 'checkbox')
    checks.forEach((c) => expect(c).not.toBeChecked())
    expect(saveButton()).toBeDisabled()
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
  { ...candidateItems[1], price: 11.4, price_per: 'KILOGRAM' },
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
    const dateEl = document.querySelectorAll('.rss-pill--locked')[1]
    expect(dateEl?.closest('button')).toBeNull()
    expect(document.querySelectorAll('.rss-pill--locked')).toHaveLength(2)
  })

  it('keeps the store pill editable when the purchase has none', () => {
    renderTargeted({ target: { ...target, store: null }, store: 'Lidl' })
    // Seeded from the parse/list and still a control.
    expect(screen.getByText('Lidl').closest('button')).not.toBeNull()
  })

  it('annotates each line as fill, correction, or no-op', () => {
    renderTargeted()
    expect(screen.getByText('completa el precio')).toBeInTheDocument()
    expect(screen.getByText('era € 1,20')).toBeInTheDocument()
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
      screen.getByText(/El total guardado pasa de € 10,00 a € 9,45/),
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

describe('ReceiptScanSheet — resolve sheet (13b)', () => {
  it('opens the resolve sub-view with the raw line as fixed truth', () => {
    renderSheet()
    fireEvent.click(openRow('MANI DULCE'))
    expect(screen.getByText('Línea del ticket')).toBeInTheDocument()
    expect(screen.getByText('Revisar ticket')).toBeInTheDocument() // back galón
    // The line's qty·price shown read-only.
    expect(screen.getByText('1 · 3,15')).toBeInTheDocument()
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
