import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

function renderSheet(
  overrides: Partial<Parameters<typeof ReceiptScanSheet>[0]> = {},
) {
  // Resolves true (success) by default, matching the real onConfirm contract —
  // guardrail tests that need a failure/pending outcome override this.
  const onConfirm = vi.fn().mockResolvedValue(true)
  const onClose = vi.fn()
  render(
    <ReceiptScanSheet
      result={mockResult}
      purchasedItems={mockPurchasedItems}
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
        purchasedItems={mockPurchasedItems}
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
    expect(unit.price).toBe(1.15)
    expect(unit.price_per).toBeNull()
    expect(unit.quantity).toBe('1')

    const kg = patches.find((p: { item_id: string }) => p.item_id === 'item-2')
    expect(kg.price).toBeCloseTo(11.4)
    expect(kg.price_per).toBe('KILOGRAM')
    expect(kg.quantity).toBe('202g')

    const multi = patches.find(
      (p: { item_id: string }) => p.item_id === 'item-3',
    )
    expect(multi.price).toBeCloseTo(0.95)
    expect(multi.price_per).toBeNull()
    expect(multi.quantity).toBe('3')
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
        purchasedItems={mockPurchasedItems}
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
    expect(created.item_name).toBe('Cacahuetes dulces')
    expect(created.store).toBe('Mercadona')
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
    expect(created.item_name).toBe('Cacahuetes')
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
    renderSheet({ purchasedItems: withUnpurchased })
    // The item isn't linked to any row yet, so every row's dropdown offers
    // it — getAllByRole rather than getByRole, since multiple <optgroup>s
    // legitimately share this label until the item is linked somewhere.
    const groups = screen.getAllByRole('group', { name: 'Sin comprar' })
    expect(groups.length).toBeGreaterThan(0)
    expect(groups[0].textContent).toContain('Pan de molde')
  })

  it('never labels an unpurchased item "Fecha desconocida"', () => {
    renderSheet({ purchasedItems: withUnpurchased })
    expect(
      screen.queryByRole('group', { name: 'Fecha desconocida' }),
    ).toBeNull()
  })

  it('links an unpurchased item instead of creating a duplicate', () => {
    const { onConfirm } = renderSheet({ purchasedItems: withUnpurchased })
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
    expect(screen.getByText(/Precio no positivo/)).toBeTruthy()
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
    const onConfirm = vi.fn().mockRejectedValue(new Error('network'))
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
    const onConfirm = vi.fn().mockResolvedValue(false)
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
    const onConfirm = vi.fn().mockReturnValue(pending)
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
