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
  ean: null,
  bought_by_weight: false,
  label: null,
  pack: null,
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

test('with no format, «Formato» folds into one «Añadir formato» row', () => {
  renderSheet()
  expect(
    screen.queryByRole('textbox', { name: 'Peso de cada unidad' }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Añadir formato/ }))
  expect(
    screen.getByRole('textbox', { name: 'Peso de cada unidad' }),
  ).toBeInTheDocument()
})

test('a format opens the block and shows the price per litre at once', () => {
  renderSheet({
    quantity: '2',
    price: 3.48,
    pack: { count: 6, content: 1.5, unit: 'l' },
  })
  expect(screen.getByText('Precio / L')).toBeInTheDocument()
  expect(screen.getByText(/^0,39\s€$/)).toBeInTheDocument()
  expect(screen.getByText('18 L')).toBeInTheDocument()
})

test('Hecho saves the typed format on the line', () => {
  const { onDone } = renderSheet({ price: 3.6, quantity: '1' })
  fireEvent.click(screen.getByRole('button', { name: /Añadir formato/ }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Unidades por envase' }),
    { target: { value: '12' } },
  )
  expect(screen.getByText('Precio / ud')).toBeInTheDocument()
  expect(screen.getByText('12 ud')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hecho' }))
  expect(onDone).toHaveBeenCalledWith(
    expect.objectContaining({ pack: { count: 12, content: null, unit: null } }),
  )
})

test('a weight with no unit keeps Hecho disabled', () => {
  renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /Añadir formato/ }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Peso de cada unidad' }),
    { target: { value: '500' } },
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Añade la unidad')
  expect(screen.getByRole('button', { name: 'Hecho' })).toBeDisabled()
})

test('a weighed line has no «Formato»', () => {
  renderSheet({ quantity: '1,02 kg' })
  expect(
    screen.queryByRole('button', { name: /Añadir formato/ }),
  ).not.toBeInTheDocument()
})
