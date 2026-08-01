import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInputValue } from '../lib/receiptDate'
import type { ReceiptScanResult } from '../types'
import ReceiptScanSheet from './ReceiptScanSheet'

const mockResult: ReceiptScanResult = {
  scan_id: 'scan-1',
  store: 'Mercadona',
  receipt_date: '2026-04-11',
  receipt_total: 6.45,
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
}

const mockPurchasedItems = [
  {
    id: 'item-1',
    name: 'Bebida de almendra 0% azúcares',
    purchased: true,
    purchased_at: '2026-04-11T15:00:00',
    brand: null,
    stores: ['Mercadona'],
    quantity: null,
  },
  {
    id: 'item-2',
    name: 'Bacon lonchas',
    purchased: true,
    purchased_at: '2026-04-11T15:00:00',
    brand: null,
    stores: ['Mercadona'],
    quantity: null,
  },
  {
    id: 'item-3',
    name: 'Yogur natural',
    purchased: true,
    purchased_at: '2026-04-11T15:00:00',
    brand: null,
    stores: [],
    quantity: null,
  },
  {
    id: 'item-4',
    name: 'Maní dulce',
    purchased: true,
    purchased_at: '2026-04-10T12:00:00',
    brand: null,
    stores: [],
    quantity: null,
  },
]

type SheetProps = Parameters<typeof ReceiptScanSheet>[0]

function renderSheet(overrides: Partial<SheetProps> = {}) {
  // Resolves true (success) by default, matching the real onConfirm contract —
  // guardrail tests that need a failure/pending outcome override this.
  const onConfirm = vi.fn<SheetProps['onConfirm']>(async () => true)
  const onClose = vi.fn()
  render(
    <ReceiptScanSheet
      result={mockResult}
      candidateItems={mockPurchasedItems}
      store="Mercadona"
      onConfirm={onConfirm}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onConfirm, onClose }
}

describe('ReceiptScanSheet', () => {
  it('shows store name and receipt total', () => {
    renderSheet()
    expect(screen.getByText('Mercadona')).toBeInTheDocument()
    expect(screen.getAllByText(/6[.,]45/).length).toBeGreaterThan(0)
  })

  it('renders OCR names for all lines', () => {
    renderSheet()
    expect(screen.getByText('BEBIDA ALMENDRAS 0%')).toBeInTheDocument()
    expect(screen.getByText('BACON LONCHAS')).toBeInTheDocument()
    expect(screen.getByText('YOGUR NATURAL')).toBeInTheDocument()
    expect(screen.getByText('MANI DULCE')).toBeInTheDocument()
  })

  it('matched items start checked, unmatched start unchecked', () => {
    renderSheet()
    const checkboxes = screen.getAllByRole('checkbox')
    // 3 matched + 1 unmatched = 4 rows
    expect(checkboxes).toHaveLength(4)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).toBeChecked()
    expect(checkboxes[2]).toBeChecked()
    expect(checkboxes[3]).not.toBeChecked()
  })

  it('toolbar shows correct count', () => {
    renderSheet()
    expect(screen.getByText('3 de 4 seleccionados')).toBeInTheDocument()
  })

  it('toggle-all selects all when not all checked', () => {
    renderSheet()
    fireEvent.click(screen.getByText('Seleccionar todo'))
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((cb) => expect(cb).toBeChecked())
    expect(screen.getByText('4 de 4 seleccionados')).toBeInTheDocument()
  })

  it('toggle-all deselects all when all are checked', () => {
    renderSheet()
    fireEvent.click(screen.getByText('Seleccionar todo')) // select all
    fireEvent.click(screen.getByText('Deseleccionar todo')) // deselect all
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked())
  })

  it('shows quantity × price summary for KILOGRAM items', () => {
    renderSheet()
    // 0.202 kg → 202g; 11.40 €/kg
    expect(screen.getByText(/202g/)).toBeInTheDocument()
    expect(screen.getByText(/11[.,]40.*€\/kg/)).toBeInTheDocument()
  })

  it('shows quantity × price summary for MULTI items', () => {
    renderSheet()
    // YOGUR NATURAL: 3× 0,95 €/ud (tighter regex to avoid matching "1× 3,15 €/ud")
    expect(screen.getByText(/3× 0[.,]95.*€\/ud/)).toBeInTheDocument()
  })

  it("shows 'sin vincular' for unmatched items", () => {
    renderSheet()
    expect(screen.getByText('sin vincular')).toBeInTheDocument()
  })

  it('unchecking a matched item updates toolbar count', () => {
    renderSheet()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(screen.getByText('2 de 4 seleccionados')).toBeInTheDocument()
  })

  it('two lines with the same receipt_name have independent checkboxes', () => {
    const result: ReceiptScanResult = {
      ...mockResult,
      matched: [
        { ...mockResult.matched[0], receipt_name: 'LECHE', item_id: 'item-1' },
        { ...mockResult.matched[1], receipt_name: 'LECHE', item_id: 'item-2' },
      ],
      unmatched: [],
    }
    render(
      <ReceiptScanSheet
        result={result}
        candidateItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // uncheck first
    expect(checkboxes[0]).not.toBeChecked()
    expect(checkboxes[1]).toBeChecked() // second unaffected
  })

  it('onConfirm called with patches including quantity', () => {
    const { onConfirm } = renderSheet()
    fireEvent.click(screen.getByText(/Guardar precios/))
    expect(onConfirm).toHaveBeenCalledOnce()
    const [patches] = onConfirm.mock.calls[0]
    expect(patches).toHaveLength(3) // 3 matched, 0 unmatched linked

    const unit = patches.find(
      (p: { item_id: string }) => p.item_id === 'item-1',
    )
    expect(unit!.price).toBe(1.15)
    expect(unit!.price_per).toBeNull()
    expect(unit!.quantity).toBe('1')

    const kg = patches.find((p: { item_id: string }) => p.item_id === 'item-2')
    expect(kg!.price).toBeCloseTo(11.4)
    expect(kg!.price_per).toBe('KILOGRAM')
    expect(kg!.quantity).toBe('202g')

    const multi = patches.find(
      (p: { item_id: string }) => p.item_id === 'item-3',
    )
    expect(multi!.price).toBeCloseTo(0.95)
    expect(multi!.price_per).toBeNull()
    expect(multi!.quantity).toBe('3')
  })

  it('footer shows selected total and receipt total', () => {
    renderSheet()
    // selected: 1.15 + 2.302 + 2.85 = 6.302 ≈ 6.30; receipt: 6.45
    expect(screen.getByText(/Seleccionado/)).toBeInTheDocument()
    // "Ticket €6.45" in footer (distinct from "Ticket escaneado" in header)
    expect(screen.getByText(/Ticket €/)).toBeInTheDocument()
  })

  it('footer shows coincide when totals match within 2 cents', () => {
    // receipt_total matches sum of matched items exactly
    const result: ReceiptScanResult = {
      ...mockResult,
      receipt_total: 1.15,
      matched: [mockResult.matched[0]],
      unmatched: [],
    }
    render(
      <ReceiptScanSheet
        result={result}
        candidateItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/coincide/)).toBeInTheDocument()
  })
})

/** The unmatched row "MANI DULCE" is the last row in the sheet. */
function selectCreateOnUnmatchedRow() {
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[selects.length - 1], {
    target: { value: '__create__' },
  })
}

describe('create mode', () => {
  it('reveals a name field when "Crear artículo nuevo" is chosen', () => {
    renderSheet()
    expect(screen.queryByPlaceholderText(/Leche semi/)).toBeNull()
    selectCreateOnUnmatchedRow()
    expect(screen.getByPlaceholderText(/Leche semi/)).toBeTruthy()
  })

  it('sends the parsed name and brand as a new item', () => {
    const { onConfirm } = renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: 'Cacahuetes dulces #Hacendado' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar precios/ }))

    const newItems = onConfirm.mock.calls[0][2]
    expect(newItems).toHaveLength(1)
    expect(newItems[0].name).toBe('Cacahuetes dulces')
    expect(newItems[0].brand).toBe('Hacendado')
    expect(newItems[0].price).toBeCloseTo(3.15)
    expect(newItems[0].store).toBe('Mercadona')
  })

  it('honours |EAN and discards +qty and @store', () => {
    const { onConfirm } = renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: 'Cacahuetes +5 @Lidl |8412345678901' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar precios/ }))

    const newItems = onConfirm.mock.calls[0][2]
    expect(newItems[0].name).toBe('Cacahuetes')
    expect(newItems[0].ean).toBe('8412345678901')
    // The row's own quantity field and the receipt header own these.
    expect(newItems[0].quantity).toBe('1')
    expect(newItems[0].store).toBe('Mercadona')
  })

  it('blocks confirm when the name parses to empty', () => {
    renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: '#Hacendado' },
    })
    const confirm = screen.getByRole('button', { name: /Guardar precios/ })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Escribe un nombre/)).toBeTruthy()
  })

  it('emits a name mapping from the receipt text to the created name', () => {
    const { onConfirm } = renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: 'Cacahuetes dulces #Hacendado' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar precios/ }))

    const mappings = onConfirm.mock.calls[0][1]
    const created = mappings.find(
      (m: { receipt_name: string }) => m.receipt_name === 'mani dulce',
    )
    expect(created).toBeTruthy()
    expect(created!.item_name).toBe('Cacahuetes dulces')
    expect(created!.store).toBe('Mercadona')
  })

  it('maps to the parsed name, not the raw sigil text', () => {
    const { onConfirm } = renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: 'Cacahuetes +5 @Lidl #Hacendado' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar precios/ }))

    const mappings = onConfirm.mock.calls[0][1]
    const created = mappings.find(
      (m: { receipt_name: string }) => m.receipt_name === 'mani dulce',
    )
    expect(created!.item_name).toBe('Cacahuetes')
  })
})

describe('unpurchased items', () => {
  const withUnpurchased = [
    ...mockPurchasedItems,
    {
      id: 'item-9',
      name: 'Pan de molde',
      purchased: false,
      purchased_at: null,
      brand: null,
      stores: [],
      quantity: null,
    },
  ]

  it('groups unpurchased items under "Sin comprar"', () => {
    renderSheet({ candidateItems: withUnpurchased })
    // The item isn't linked to any row yet, so every row's dropdown offers
    // it — getAllByRole rather than getByRole, since multiple <optgroup>s
    // legitimately share this label until the item is linked somewhere.
    const groups = screen.getAllByRole('group', { name: 'Sin comprar' })
    expect(groups.length).toBeGreaterThan(0)
    expect(groups[0].textContent).toContain('Pan de molde')
  })

  it('never labels an unpurchased item "Fecha desconocida"', () => {
    renderSheet({ candidateItems: withUnpurchased })
    expect(
      screen.queryByRole('group', { name: 'Fecha desconocida' }),
    ).toBeNull()
  })

  it('links an unpurchased item instead of creating a duplicate', () => {
    const { onConfirm } = renderSheet({ candidateItems: withUnpurchased })
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[selects.length - 1], {
      target: { value: 'item-9' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar precios/ }))

    const patches = onConfirm.mock.calls[0][0]
    const newItems = onConfirm.mock.calls[0][2]
    expect(
      patches.some((p: { item_id: string }) => p.item_id === 'item-9'),
    ).toBe(true)
    // Linking must REPLACE creating — this is the duplicate-items fix.
    expect(newItems).toHaveLength(0)
  })
})

describe('confirm guardrails', () => {
  it('warns when a create row has a non-positive price', () => {
    renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: 'Descuento tarjeta' },
    })
    const priceInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(priceInputs[priceInputs.length - 1], {
      target: { value: '-2' },
    })
    expect(screen.getByText(/Precio cero o negativo/)).toBeTruthy()
  })

  it('does not warn on a non-positive price when the row is unchecked', () => {
    renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: 'Descuento tarjeta' },
    })
    const priceInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(priceInputs[priceInputs.length - 1], {
      target: { value: '-2' },
    })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[checkboxes.length - 1]) // uncheck the row
    expect(screen.queryByText(/Precio cero o negativo/)).toBeNull()
  })

  it('does not block confirm on a non-positive price', () => {
    renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: 'Descuento tarjeta' },
    })
    const priceInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(priceInputs[priceInputs.length - 1], {
      target: { value: '-2' },
    })
    const confirm = screen.getByRole('button', {
      name: /Guardar precios/,
    }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
  })

  it('disables confirm after the first submit', () => {
    const { onConfirm } = renderSheet()
    const confirm = screen.getByRole('button', {
      name: /Guardar precios/,
    }) as HTMLButtonElement
    fireEvent.click(confirm)
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('associates the create input with its validation messages', () => {
    renderSheet()
    selectCreateOnUnmatchedRow()
    fireEvent.change(screen.getByPlaceholderText(/Leche semi/), {
      target: { value: '#Hacendado' },
    })
    const input = screen.getByPlaceholderText(/Leche semi/)
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const error = screen.getByRole('alert')
    expect(describedBy!.split(' ')).toContain(error.id)
    expect(error.textContent).toMatch(/Escribe un nombre/)
  })

  it('re-enables confirm after a rejected submit, so the user can retry', async () => {
    const onConfirm = vi.fn<SheetProps['onConfirm']>(() =>
      Promise.reject(new Error('network')),
    )
    renderSheet({ onConfirm })
    const confirm = screen.getByRole('button', {
      name: /Guardar precios/,
    }) as HTMLButtonElement
    fireEvent.click(confirm)
    await waitFor(() => expect(confirm.disabled).toBe(false))
  })

  it('re-enables confirm after onConfirm resolves false, so the user can retry', async () => {
    // This is the branch the real ListScreen hits: submitReceiptPrices
    // rejects, handleReceiptConfirm catches it and resolves false — it
    // never rejects across the onConfirm boundary.
    const onConfirm = vi.fn<SheetProps['onConfirm']>(async () => false)
    renderSheet({ onConfirm })
    const confirm = screen.getByRole('button', {
      name: /Guardar precios/,
    }) as HTMLButtonElement
    fireEvent.click(confirm)
    await waitFor(() => expect(confirm.disabled).toBe(false))
  })

  it('keeps confirm disabled while a submit is in flight', async () => {
    let resolveSubmit: (ok: boolean) => void = () => {}
    const pending = new Promise<boolean>((resolve) => {
      resolveSubmit = resolve
    })
    const onConfirm = vi.fn<SheetProps['onConfirm']>(() => pending)
    renderSheet({ onConfirm })
    const confirm = screen.getByRole('button', {
      name: /Guardar precios/,
    }) as HTMLButtonElement
    fireEvent.click(confirm)
    expect(confirm.disabled).toBe(true)
    resolveSubmit(true)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })
})

const mockProduct = {
  ean: '8412345678901',
  name: 'Cacahuetes dulces',
  brand: 'Hacendado',
  stores: [],
  community_price: null,
  community_price_per: null,
}

describe('barcode scan into a create row', () => {
  it('asks the parent to scan for a specific row', () => {
    const onRequestScan = vi.fn()
    renderSheet({ onRequestScan })
    selectCreateOnUnmatchedRow()
    fireEvent.click(
      screen.getByRole('button', { name: 'Escanear código de barras' }),
    )
    expect(onRequestScan).toHaveBeenCalledWith(3)
  })

  it('fills the row from a scanned product and expands it', () => {
    renderSheet({
      pendingScan: { index: 3, product: mockProduct },
    })

    const field = screen.getByPlaceholderText(/Leche semi/) as HTMLInputElement
    expect(field.value).toBe('Cacahuetes dulces #Hacendado')
    expect(field.closest('.rss-row')).toHaveClass('expanded')
  })

  it('omits the brand sigil when the product has no brand', () => {
    renderSheet({
      pendingScan: { index: 3, product: { ...mockProduct, brand: null } },
    })
    const field = screen.getByPlaceholderText(/Leche semi/) as HTMLInputElement
    expect(field.value).toBe('Cacahuetes dulces')
  })

  it('sends the scanned EAN with the created item', async () => {
    const { onConfirm } = renderSheet({
      pendingScan: { index: 3, product: mockProduct },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar precios/ }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())

    const newItems = onConfirm.mock.calls[0][2]
    expect(newItems[0].ean).toBe('8412345678901')
    expect(newItems[0].name).toBe('Cacahuetes dulces')
    expect(newItems[0].brand).toBe('Hacendado')
  })

  it('applies a second scan into the same row, proving identity — not latch — drives it', () => {
    const onConfirm = vi.fn<SheetProps['onConfirm']>(async () => true)
    const onClose = vi.fn()
    const { rerender } = render(
      <ReceiptScanSheet
        result={mockResult}
        candidateItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={onConfirm}
        onClose={onClose}
        pendingScan={{ index: 3, product: mockProduct }}
      />,
    )
    expect(
      (screen.getByPlaceholderText(/Leche semi/) as HTMLInputElement).value,
    ).toBe('Cacahuetes dulces #Hacendado')

    const secondProduct = {
      ean: '1111111111111',
      name: 'Almendras crudas',
      brand: 'Auchan',
      stores: [],
      community_price: null,
      community_price_per: null,
    }
    rerender(
      <ReceiptScanSheet
        result={mockResult}
        candidateItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={onConfirm}
        onClose={onClose}
        pendingScan={{ index: 3, product: secondProduct }}
      />,
    )
    expect(
      (screen.getByPlaceholderText(/Leche semi/) as HTMLInputElement).value,
    ).toBe('Almendras crudas #Auchan')
  })

  it('does not re-apply the same pendingScan object on an unrelated re-render', () => {
    const onConfirm = vi.fn<SheetProps['onConfirm']>(async () => true)
    const onClose = vi.fn()
    const pendingScan = { index: 3, product: mockProduct }
    const { rerender } = render(
      <ReceiptScanSheet
        result={mockResult}
        candidateItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={onConfirm}
        onClose={onClose}
        pendingScan={pendingScan}
      />,
    )
    const field = screen.getByPlaceholderText(/Leche semi/) as HTMLInputElement
    fireEvent.change(field, { target: { value: 'Edited by hand' } })
    // Re-render with the SAME pendingScan object reference — must not
    // clobber the user's hand edit.
    rerender(
      <ReceiptScanSheet
        result={mockResult}
        candidateItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={onConfirm}
        onClose={onClose}
        pendingScan={pendingScan}
      />,
    )
    expect(
      (screen.getByPlaceholderText(/Leche semi/) as HTMLInputElement).value,
    ).toBe('Edited by hand')
  })
})

// --- Receipt date confirmation (JAV-54) --------------------------------------
//
// Dates are expressed relative to a pinned `NOW` rather than to a literal,
// because the threshold in lib/receiptDate.ts is relative to today: a literal
// would silently change verdict as real-world time passes.

/** A fixed **local** instant, so nothing here reads the wall clock.
 *
 *  Reading it was the whole defect. `lib/receiptDate.ts` reduces `now` to the
 *  viewer's local day, so a fixture reduced to a UTC day drifted by one
 *  wherever the two calendars disagreed — and `-3` and `-4` sit either side of
 *  RECEIPT_DATE_TOLERANCE_DAYS on purpose, so a one-day drift pushed whichever
 *  one the offset's sign pointed at across the threshold. Two hours nightly at
 *  UTC+2, four hours every evening at UTC−4, in opposite directions.
 *
 *  Building from local components fixes today's verdict; pinning the clock is
 *  what removes the class. A helper that read `Date.now()` would still be
 *  correct and still be one refactor from being wrong again.
 *
 *  Same shape as `lib/receiptDate.test.ts`, deliberately — that file had it
 *  right first, two directories away, with the trap written on it.
 *
 *  **00:30 rather than midday, and that is not arbitrary.** Correctness no
 *  longer depends on the hour — `daysAway` is zone-independent by
 *  construction — but *detecting a regression* to a UTC reduction does, and
 *  no single instant catches both signs: zones ahead of UTC diverge just
 *  after local midnight, zones behind it during local evening. Midday catches
 *  neither at ordinary offsets, which is exactly how the original sweep
 *  stopped one sign short. 00:30 makes the eastern sign — the one that
 *  actually bit, in Madrid — fail on every local run rather than for two
 *  hours a night.
 *
 *  Worth knowing before trusting a green CI run here: **UTC never diverges at
 *  any hour**, so the runner cannot catch this class at all. The guard below
 *  is what states the invariant; the zone spread is a developer-machine
 *  check.
 */
const NOW = new Date(2026, 6, 25, 0, 30, 0)

/** A bare calendar day `delta` days from `NOW`, on a zone-less calendar.
 *
 *  The arithmetic runs in UTC and is read back in UTC, so no offset enters and
 *  DST cannot bite. It agrees with `NOW`'s local day in every timezone because
 *  both name the same calendar date, 2026-07-25 — not because they happen to
 *  land in the same zone.
 */
const daysAway = (delta: number) => {
  const day = new Date(Date.UTC(2026, 6, 25) + delta * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`
}

const openEditor = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Corregir fecha' }))

describe('ReceiptScanSheet receipt date', () => {
  // Only `Date` is faked. The sheet reaches `isReceiptDateWorthConfirming` on
  // its default `now = new Date()` argument, so the clock has to be pinned
  // from out here — but faking timers wholesale would take `setTimeout` with
  // it, and RTL schedules through it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // The invariant every case below rests on, asserted once and by name. When
  // it breaks, the failures land on window-boundary tests whose messages say
  // nothing about calendars — the -3 and -4 fixtures sit either side of the
  // tolerance precisely so a one-day drift flips them, which makes them
  // sensitive detectors and terrible explanations. `todayInputValue` is the
  // module's own local-day reduction, so this compares the fixture's calendar
  // against the one the code under test actually uses.
  test('builds fixtures on the same calendar the module reads', () => {
    expect(daysAway(0)).toBe(todayInputValue())
  })

  test('asks about a date outside the match window', () => {
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-10) },
      onDateCorrected: vi.fn(),
    })
    expect(screen.getByText('¿Es correcta la fecha?')).toBeInTheDocument()
    expect(
      screen.getByText('Una fecha exacta nos ayuda a emparejar tus compras.'),
    ).toBeInTheDocument()
  })

  test('asks about a misread day, not just a misread year', () => {
    // A few days off empties the same match window a wrong year does.
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-4) },
      onDateCorrected: vi.fn(),
    })
    expect(screen.getByText('¿Es correcta la fecha?')).toBeInTheDocument()
  })

  test('stays quiet inside the match window', () => {
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-3) },
      onDateCorrected: vi.fn(),
    })
    expect(screen.queryByText('¿Es correcta la fecha?')).not.toBeInTheDocument()
  })

  test('stays quiet when the date cannot be corrected', () => {
    // Without a handler the prompt would be a dead end, so it is not shown
    // even though the date is far from today.
    renderSheet({ result: { ...mockResult, receipt_date: daysAway(-30) } })
    expect(screen.queryByText('¿Es correcta la fecha?')).not.toBeInTheDocument()
  })

  test('does not re-query a date the user already corrected', () => {
    // The scenario JAV-6 has to keep working: a genuinely old receipt, dated
    // by hand and still far outside the match window. A correction remounts
    // this sheet with a new scan_id, resetting its own dismissal state, so
    // without the parent's flag the user is asked about the date they just
    // typed. Deliberately still out of window — that is what makes it a
    // regression test rather than a restatement of the threshold.
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-30) },
      onDateCorrected: vi.fn(),
      dateConfirmed: true,
    })
    expect(screen.queryByText('¿Es correcta la fecha?')).not.toBeInTheDocument()
    // Still correctable — suppressing the question must not remove the way in.
    expect(
      screen.getByRole('button', { name: /Cambiar la fecha del ticket/ }),
    ).toBeInTheDocument()
  })

  test('confirming the date dismisses the prompt for good', () => {
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-30) },
      onDateCorrected: vi.fn(),
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'La fecha es correcta' }),
    )
    expect(screen.queryByText('¿Es correcta la fecha?')).not.toBeInTheDocument()
  })

  test('sends the corrected date back for a re-match', () => {
    const onDateCorrected = vi.fn()
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-30) },
      onDateCorrected,
    })

    openEditor()
    fireEvent.change(screen.getByLabelText('Fecha del ticket'), {
      target: { value: '2026-04-11' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Volver a buscar' }))

    expect(onDateCorrected).toHaveBeenCalledWith('2026-04-11')
  })

  test('keeps the time of day when only the date is corrected', () => {
    const onDateCorrected = vi.fn()
    const printed = `${daysAway(-30)}T17:42:00Z`
    renderSheet({
      result: { ...mockResult, receipt_date: printed },
      onDateCorrected,
    })

    openEditor()
    fireEvent.change(screen.getByLabelText('Fecha del ticket'), {
      target: { value: '2026-04-11' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Volver a buscar' }))

    // Asserted as an instant, not a literal string: the correction is
    // re-encoded the way receiptAi emits dates, so the exact UTC text depends
    // on the viewer's offset. What has to hold is the day they picked and the
    // wall-clock time the receipt was printed at.
    const sent = new Date(onDateCorrected.mock.calls[0][0] as string)
    const printedAt = new Date(printed)
    expect([sent.getFullYear(), sent.getMonth(), sent.getDate()]).toEqual([
      2026, 3, 11,
    ])
    expect(sent.getHours()).toBe(printedAt.getHours())
    expect(sent.getMinutes()).toBe(printedAt.getMinutes())
  })

  test('will not re-match an unchanged date', () => {
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-30) },
      onDateCorrected: vi.fn(),
    })
    openEditor()
    expect(
      screen.getByRole('button', { name: 'Volver a buscar' }),
    ).toBeDisabled()
  })

  test('a date inside the window is still correctable from the header', () => {
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-1) },
      onDateCorrected: vi.fn(),
    })
    // No prompt, but the affordance is there for a misread we did not catch.
    fireEvent.click(
      screen.getByRole('button', { name: /Cambiar la fecha del ticket/ }),
    )
    expect(screen.getByLabelText('Fecha del ticket')).toBeInTheDocument()
  })

  test('cancelling the editor restores the original date', () => {
    const onDateCorrected = vi.fn()
    renderSheet({
      result: { ...mockResult, receipt_date: daysAway(-30) },
      onDateCorrected,
    })
    openEditor()
    fireEvent.change(screen.getByLabelText('Fecha del ticket'), {
      target: { value: '2026-04-11' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByText('¿Es correcta la fecha?')).toBeInTheDocument()
    expect(onDateCorrected).not.toHaveBeenCalled()
  })
})
