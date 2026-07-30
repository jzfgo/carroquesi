import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CloseLine } from '../lib/closeLines'
import type { PurchaseClosePayload } from '../types'
import { CloseTripSheet, type CloseTripSheetProps } from './CloseTripSheet'

function makeLine(over: Partial<CloseLine> = {}): CloseLine {
  return {
    key: 'k1',
    itemId: 'i1',
    name: 'Leche',
    brand: null,
    quantity: null,
    price: null,
    pricePer: null,
    included: true,
    fromCart: true,
    ...over,
  }
}

// Two priced rows whose amounts no single row prints: 1.19 × 6 = 7.14, plus
// 2.00 × 1, so only the total can read 9.14. A figure a row also shows would
// let an assertion pass by matching the row instead.
const milk = makeLine({
  key: 'k1',
  itemId: 'i1',
  name: 'Leche',
  price: 1.19,
  quantity: '6',
})
const bread = makeLine({
  key: 'k2',
  itemId: 'i2',
  name: 'Pan',
  price: 2,
  quantity: '1',
})

function renderSheet(over: Partial<CloseTripSheetProps> = {}) {
  const onSave = vi.fn<(payload: PurchaseClosePayload) => void>()
  const onClose = vi.fn()
  render(
    <CloseTripSheet
      initialLines={[milk, bread]}
      storeSuggestions={['Mercadona', 'Dia']}
      defaultDate="2026-07-30T18:00:00"
      purchaseId={null}
      isOffline={false}
      onSave={onSave}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSave, onClose }
}

const save = () => screen.getByRole('button', { name: 'Guardar compra' })
const totalText = () =>
  document.querySelector('.cts__total-amount')?.textContent ?? ''

describe('CloseTripSheet', () => {
  it('cannot be saved until a shop is named', async () => {
    const { onSave } = renderSheet()

    expect(save()).toBeDisabled()
    await userEvent.click(save())
    expect(onSave).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))

    expect(save()).toBeEnabled()
  })

  it('sends only the ticked rows, under the shop that was picked', async () => {
    const { onSave } = renderSheet()

    await userEvent.click(screen.getByLabelText('Pan'))
    await userEvent.click(screen.getByRole('button', { name: 'Dia' }))
    await userEvent.click(save())

    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(payload.store).toBe('Dia')
    expect(payload.lines).toEqual([
      expect.objectContaining({ item_id: 'i1', price: 1.19 }),
    ])
    expect(payload.new_items).toEqual([])
  })

  // A close written by hand confirms no figure. Only a receipt does, so the
  // total travels empty however much the lines add up to.
  it('closes the trip it was opened for, and confirms no total', async () => {
    const { onSave } = renderSheet({ purchaseId: 'p9' })

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())

    expect(onSave.mock.calls[0][0].purchase_id).toBe('p9')
    expect(onSave.mock.calls[0][0].total).toBeNull()
  })

  it('unticks everything at once, which leaves nothing to save', async () => {
    renderSheet()

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    expect(save()).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar todas' }))

    expect(screen.getByLabelText('Leche')).not.toBeChecked()
    expect(screen.getByLabelText('Pan')).not.toBeChecked()
    expect(save()).toBeDisabled()
  })

  it('adds up the ticked rows by price and amount', () => {
    renderSheet()

    expect(screen.getByText('Total de lo que has puesto')).toBeInTheDocument()
    // 1.19 × 6 + 2.00 × 1
    expect(totalText()).toMatch(/9[,.]14/)
  })

  it('drops a row from the total when it is unticked', async () => {
    renderSheet()

    await userEvent.click(screen.getByLabelText('Pan'))

    expect(totalText()).toMatch(/7[,.]14/)
  })

  it('says a row has no price rather than pricing it at zero', () => {
    renderSheet({ initialLines: [makeLine({ price: null })] })

    expect(screen.getByText('sin precio')).toBeInTheDocument()
    expect(totalText()).not.toMatch(/0[,.]00/)
  })

  it('marks the total as a floor when a ticked row carries no price', () => {
    renderSheet({ initialLines: [milk, makeLine({ key: 'k3', price: null })] })

    expect(totalText()).toMatch(/≥/)
    expect(totalText()).toMatch(/7[,.]14/)
  })

  // The count of priceless rows would not mention this one: it has a price,
  // and still cannot be worked out, because a price per kilo needs a weight.
  it('marks the total as a floor when a per-kilo row has no readable weight', () => {
    renderSheet({
      initialLines: [
        milk,
        makeLine({
          key: 'k4',
          name: 'Tomates',
          price: 3.5,
          pricePer: 'KILOGRAM',
          quantity: 'un poco',
        }),
      ],
    })

    expect(totalText()).toMatch(/≥/)
    expect(totalText()).toMatch(/7[,.]14/)
  })

  it('leaves the total unmarked when every ticked row is in it', () => {
    renderSheet()

    expect(totalText()).not.toMatch(/≥/)
  })

  it("stamps the trip's own day, not today", async () => {
    const { onSave } = renderSheet()

    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-07-30')

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())

    expect(onSave.mock.calls[0][0].purchased_at).toBe('2026-07-30T18:00:00')
  })

  // Noon in Madrid, which is 10:00 UTC in July. Far enough from either
  // midnight that no offset can drag the stamp into a neighbouring day.
  it('stamps a moved day at midday, so it cannot slip into the next one', async () => {
    const { onSave } = renderSheet()

    fireEvent.change(screen.getByLabelText('Fecha'), {
      target: { value: '2026-07-29' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())

    expect(onSave.mock.calls[0][0].purchased_at).toBe('2026-07-29T10:00:00')
  })

  // The half-hour after midnight in Madrid is still the previous day in UTC,
  // and it is exactly when a torn-off trip gets written down.
  it('shows the day it was in Madrid, not the day the stored instant reads', async () => {
    const { onSave } = renderSheet({ defaultDate: '2026-07-29T22:30:00' })

    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-07-30')

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())

    // Untouched, so the trip keeps its own instant rather than being moved to
    // noon on a day it already belonged to.
    expect(onSave.mock.calls[0][0].purchased_at).toBe('2026-07-29T22:30:00')
  })

  it('cannot be saved with no date', async () => {
    renderSheet()

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    expect(save()).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })

    expect(save()).toBeDisabled()
  })

  it('offers a row that is still on the list, unticked and marked as such', () => {
    renderSheet({
      initialLines: [
        milk,
        makeLine({ key: 'k5', name: 'Café', fromCart: false, included: false }),
      ],
    })

    expect(screen.getByLabelText('Leche')).toBeChecked()
    expect(screen.getByLabelText('Café')).not.toBeChecked()
    expect(screen.getByText(/sigue en la lista/)).toBeInTheDocument()
  })

  // Picking a shop from the row settles it, the way the price sheet does. The
  // half-typed name stops being what saves, so the two cannot disagree.
  it('saves the shop that was picked, not the one half-typed before it', async () => {
    const { onSave } = renderSheet()

    await userEvent.click(screen.getByRole('button', { name: '+ otra' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Frutería Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())

    expect(onSave.mock.calls[0][0].store).toBe('Mercadona')
  })

  // Going back to the free field hands back what was typed there. The name
  // was not thrown away by picking a shop, only set aside.
  it('gives back the name typed by hand when the field is reopened', async () => {
    const { onSave } = renderSheet()

    await userEvent.click(screen.getByRole('button', { name: '+ otra' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Frutería Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(screen.getByRole('button', { name: '+ otra' }))

    expect(screen.getByLabelText('Tienda')).toHaveValue('Frutería Ana')

    await userEvent.click(save())

    expect(onSave.mock.calls[0][0].store).toBe('Frutería Ana')
  })

  it('saves a shop typed by hand', async () => {
    const { onSave } = renderSheet({ storeSuggestions: [] })

    await userEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Frutería Ana')
    await userEvent.click(save())

    expect(onSave.mock.calls[0][0].store).toBe('Frutería Ana')
  })

  it('opens a row for adjustment and keeps what comes back', async () => {
    const onEditLine = vi.fn((line: CloseLine, apply: (l: CloseLine) => void) =>
      apply({ ...line, price: 4 }),
    )
    renderSheet({ initialLines: [milk], onEditLine })

    await userEvent.click(screen.getByRole('button', { name: 'Ajustar Leche' }))

    expect(onEditLine.mock.calls[0][0]).toMatchObject({ key: 'k1' })
    // 4.00 × 6, and the row alone prints 4.00.
    expect(totalText()).toMatch(/24[,.]00/)
  })

  it('adds something that was never on the list, once', async () => {
    const onEditLine = vi.fn((line: CloseLine, apply: (l: CloseLine) => void) =>
      apply({ ...line, name: 'Hielo', price: 1, quantity: '1' }),
    )
    const { onSave } = renderSheet({ onEditLine })

    await userEvent.click(
      screen.getByRole('button', { name: 'Añadir producto' }),
    )

    expect(screen.getAllByLabelText('Hielo')).toHaveLength(1)
    expect(screen.getByText('3 de 3')).toBeInTheDocument()

    // It behaves like any other row from here on.
    await userEvent.click(screen.getByLabelText('Hielo'))
    expect(screen.getByText('2 de 3')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Hielo'))
    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())

    expect(onSave.mock.calls[0][0].new_items).toEqual([
      expect.objectContaining({ name: 'Hielo', price: 1 }),
    ])
  })

  // Add, drop, add again: the second new row must not reuse the first one's
  // identity, or React folds the two together.
  it('gives every added row an identity of its own', async () => {
    let n = 0
    const onEditLine = vi.fn((line: CloseLine, apply: (l: CloseLine) => void) =>
      apply({ ...line, name: `Extra ${++n}`, price: 1, quantity: '1' }),
    )
    renderSheet({ initialLines: [], onEditLine })

    const add = () => screen.getByRole('button', { name: 'Añadir producto' })
    await userEvent.click(add())
    await userEvent.click(add())

    expect(screen.getByLabelText('Extra 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Extra 2')).toBeInTheDocument()
    expect(screen.getByText('2 de 2')).toBeInTheDocument()
  })

  it('counts what is ticked and what still has no price', async () => {
    renderSheet({ initialLines: [milk, makeLine({ key: 'k6', price: null })] })

    expect(screen.getByText('2 de 2 · 1 sin precio')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar todas' }))

    expect(screen.getByText('0 de 2')).toBeInTheDocument()
  })

  it('marks them all again once none are ticked', async () => {
    renderSheet()

    await userEvent.click(screen.getByRole('button', { name: 'Quitar todas' }))
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todas' }))

    expect(screen.getByLabelText('Leche')).toBeChecked()
    expect(screen.getByLabelText('Pan')).toBeChecked()
  })

  it('promises that a close made offline is kept, not refused', () => {
    renderSheet({ isOffline: true })

    expect(
      screen.getByText('Se guardará cuando vuelva la conexión'),
    ).toBeInTheDocument()
  })

  it('still lets the household save while offline', async () => {
    const { onSave } = renderSheet({ isOffline: true })

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())

    expect(onSave).toHaveBeenCalled()
  })

  // Both of a row's targets are painted smaller than they are touched, so a
  // screenshot cannot tell whether the touchable part is still there.
  it("keeps both of a row's targets at 44px", () => {
    renderSheet()

    for (const selector of ['.cts__check', '.cts__door']) {
      const el = document.querySelector(selector) as HTMLElement
      const style = getComputedStyle(el)
      const reach =
        parseFloat(style.width) +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight)
      expect(reach).toBeGreaterThanOrEqual(44)
    }
  })

  // A 1.5px border costs fewer pixels than the visual-regression budget, so a
  // screenshot cannot be what guards it.
  it('draws the paper slot as dashed, since there is no paper yet', () => {
    renderSheet()

    const thumb = document.querySelector('.cts__thumb') as HTMLElement
    expect(getComputedStyle(thumb).borderStyle).toBe('dashed')
  })
})

describe('CloseTripSheet and a save already in flight', () => {
  it('files the shop once however many times the button is pressed', async () => {
    // The sheet stays mounted through a failure now, so nothing unmounts it
    // out from under a second press. Two closes would file the cart twice and
    // the second would come back refused — a failure toast over a shop that
    // saved.
    let settle: () => void = () => {}
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        }),
    )
    renderSheet({ onSave })

    await userEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    await userEvent.click(save())
    await userEvent.click(save())
    await userEvent.click(save())

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(save()).toBeDisabled()

    settle()
  })
})
