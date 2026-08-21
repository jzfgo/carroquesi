import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AdjustProductSheet, type DraftLine } from './AdjustProductSheet'

const base: DraftLine = {
  item_id: 'i1',
  name: 'Leche',
  brand: null,
  quantity: '6',
  price: null,
  price_per: null,
  included: true,
  suggested: null,
}

function renderSheet(over: Partial<DraftLine> = {}, isNew = false) {
  const onDone = vi.fn()
  const onRemove = vi.fn()
  const onBack = vi.fn()
  render(
    <AdjustProductSheet
      line={{ ...base, ...over }}
      isNew={isNew}
      onDone={onDone}
      onRemove={onRemove}
      onBack={onBack}
    />,
  )
  return { onDone, onRemove, onBack }
}

test('the unit is derived from the quantity — /ud for a count, /kg for a weight', () => {
  renderSheet({ quantity: '6' })
  expect(screen.getByText('/ud')).toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText('6'), {
    target: { value: '500 ml' },
  })
  expect(screen.getByText('/kg')).toBeInTheDocument()
})

test('the line total is quantity × price', () => {
  renderSheet({ quantity: '6' })
  fireEvent.change(screen.getByPlaceholderText('0,00'), {
    target: { value: '1,15' },
  })
  // 6 × 1,15 = 6,90
  expect(screen.getByText(/6,90/)).toBeInTheDocument()
})

test('«Quitar del carro» drops the line', () => {
  const { onRemove } = renderSheet()
  fireEvent.click(screen.getByText('Quitar del carro'))
  expect(onRemove).toHaveBeenCalled()
})

test('a blank line shows «Descartar» instead of «Quitar del carro»', () => {
  renderSheet({ item_id: null, name: '' }, true)
  expect(screen.getByText('Descartar')).toBeInTheDocument()
  expect(screen.queryByText('Quitar del carro')).not.toBeInTheDocument()
})

test('confirming the suggested price sets it; Hecho then saves that price', () => {
  const { onDone } = renderSheet({
    quantity: '1 kg',
    suggested: { price: 2.49, price_per: 'KILOGRAM' },
  })
  // The opt-in question is shown while the price is untouched.
  expect(
    screen.getByText('¿Usar el último precio registrado en esta tienda?'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Usar el precio sugerido'))
  fireEvent.click(screen.getByText('Hecho'))
  expect(onDone).toHaveBeenCalledWith(
    expect.objectContaining({ price: 2.49, price_per: 'KILOGRAM' }),
  )
})

test('an untouched suggestion saves without a price (bought, unpriced)', () => {
  const { onDone } = renderSheet({
    suggested: { price: 2.49, price_per: null },
  })
  fireEvent.click(screen.getByText('Hecho'))
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ price: null }))
})

test('Hecho is disabled until the product has a name', () => {
  renderSheet({ name: '' })
  expect(screen.getByText('Hecho')).toBeDisabled()
})
