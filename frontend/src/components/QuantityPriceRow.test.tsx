import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { QuantityPriceRow } from './QuantityPriceRow'

function renderRow(over: Partial<Parameters<typeof QuantityPriceRow>[0]> = {}) {
  const props = {
    id: 'qp',
    quantity: '346 g',
    priceText: '8,82',
    suffix: '/kg',
    onQuantityChange: vi.fn(),
    onPriceChange: vi.fn(),
    onQuantityBlur: vi.fn(),
    onPriceBlur: vi.fn(),
    ...over,
  }
  render(<QuantityPriceRow {...props} />)
  return props
}

test('renders the shared copy', () => {
  renderRow()
  expect(screen.getByLabelText('Cantidad y precio')).toHaveValue('346 g')
  expect(screen.getByLabelText('Precio')).toHaveValue('8,82')
  expect(screen.getByText('/kg')).toBeInTheDocument()
  expect(screen.getByLabelText('Cantidad y precio')).toHaveAttribute(
    'placeholder',
    '6',
  )
  expect(screen.getByText(/El precio se ajusta solo\./)).toHaveTextContent(
    'Escribe unidades (6) o peso (500 ml, 1,12 kg). El precio se ajusta solo.',
  )
})

test('reports edits and blurs', () => {
  const p = renderRow()
  const qty = screen.getByLabelText('Cantidad y precio')
  const price = screen.getByLabelText('Precio')

  fireEvent.change(qty, { target: { value: '2' } })
  expect(p.onQuantityChange).toHaveBeenCalledWith('2')
  fireEvent.change(price, { target: { value: '3,50' } })
  expect(p.onPriceChange).toHaveBeenCalledWith('3,50')

  qty.focus()
  fireEvent.keyDown(qty, { key: 'Enter' })
  expect(p.onQuantityBlur).toHaveBeenCalled()
  price.focus()
  fireEvent.keyDown(price, { key: 'Enter' })
  expect(p.onPriceBlur).toHaveBeenCalled()
})

test('suggested marks the price box', () => {
  renderRow({ suggested: true })
  expect(screen.getByLabelText('Precio').parentElement).toHaveClass(
    'qtyprice__price--suggested',
  )
})

test('children render under the help', () => {
  renderRow({ children: <p>debajo</p> })
  expect(screen.getByText('debajo')).toBeInTheDocument()
})
