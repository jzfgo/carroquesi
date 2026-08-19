import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ADD_STORE, StoreSelect } from './StoreSelect'

const baseProps = {
  options: ['Mercadona', 'Lidl'],
  value: '',
  onSelect: vi.fn(),
  onAddNew: vi.fn(),
}

const select = () => screen.getByLabelText<HTMLSelectElement>('Tienda')

test('picking an option calls onSelect with it', () => {
  const onSelect = vi.fn()
  render(<StoreSelect {...baseProps} onSelect={onSelect} />)
  fireEvent.change(select(), { target: { value: 'Lidl' } })
  expect(onSelect).toHaveBeenCalledWith('Lidl')
})

test('picking «+ otra» calls onAddNew, not onSelect', () => {
  const onSelect = vi.fn()
  const onAddNew = vi.fn()
  render(<StoreSelect {...baseProps} onSelect={onSelect} onAddNew={onAddNew} />)
  fireEvent.change(select(), { target: { value: ADD_STORE } })
  expect(onAddNew).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})

test('a raw spelling variant lights up its registry option (key match)', () => {
  render(<StoreSelect {...baseProps} value="MERCADONA " />)
  expect(select().value).toBe('Mercadona')
})

test('a value outside the offer is kept as its own option', () => {
  render(<StoreSelect {...baseProps} value="Ahorramás" />)
  expect(select().value).toBe('Ahorramás')
  expect(screen.getByRole('option', { name: 'Ahorramás' })).toBeInTheDocument()
})

test('emptyLabel offers a no-store choice that selects back to empty', () => {
  const onSelect = vi.fn()
  render(
    <StoreSelect
      {...baseProps}
      value="Lidl"
      onSelect={onSelect}
      emptyLabel="Sin tienda"
    />,
  )
  fireEvent.change(select(), { target: { value: '' } })
  expect(onSelect).toHaveBeenCalledWith('')
})

test('without emptyLabel an empty value shows a non-choice placeholder', () => {
  render(<StoreSelect {...baseProps} options={[]} value="" />)
  // By text, not role: the placeholder is not a choice, so it is absent from
  // the accessibility tree on purpose (hidden + disabled).
  const placeholder = screen.getByText('Elige tienda') as HTMLOptionElement
  expect(placeholder.disabled).toBe(true)
  expect(placeholder.hidden).toBe(true)
})
