import { fireEvent, render, screen } from '@testing-library/react'
import type { ListItem } from '../types'
import { TagEditor } from './TagEditor'

const BASE_ITEM: ListItem = {
  id: 'i1',
  list_id: 'l1',
  name: 'Leche entera',
  quantity: '2',
  purchased_quantity: null,
  brand: 'Hacendado',
  stores: ['Mercadona'],
  purchased: false,
  purchased_at: null,
  purchase_has_receipt: false,
  bought_by_weight: false,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
}

const OTHER_ITEMS: ListItem[] = [
  { ...BASE_ITEM, id: 'i2', brand: 'Danone' },
  { ...BASE_ITEM, id: 'i3', brand: 'Pascual' },
]

test('pre-fills input with current field value', () => {
  render(
    <TagEditor
      item={BASE_ITEM}
      field="brand"
      items={[BASE_ITEM]}
      onSave={() => {}}
    />,
  )
  expect(screen.getByRole('textbox')).toHaveValue('Hacendado')
})

test('shows empty input when field value is null', () => {
  const item = { ...BASE_ITEM, brand: null }
  render(
    <TagEditor item={item} field="brand" items={[item]} onSave={() => {}} />,
  )
  expect(screen.getByRole('textbox')).toHaveValue('')
})

test('Save button calls onSave with trimmed value', () => {
  const onSave = vi.fn()
  render(
    <TagEditor
      item={BASE_ITEM}
      field="brand"
      items={[BASE_ITEM]}
      onSave={onSave}
    />,
  )
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '  Danone  ' },
  })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(onSave).toHaveBeenCalledWith('Danone')
})

test('clearing input and saving calls onSave(null)', () => {
  const onSave = vi.fn()
  render(
    <TagEditor
      item={BASE_ITEM}
      field="brand"
      items={[BASE_ITEM]}
      onSave={onSave}
    />,
  )
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(onSave).toHaveBeenCalledWith(null)
})

test('Enter key triggers save', () => {
  const onSave = vi.fn()
  render(
    <TagEditor
      item={BASE_ITEM}
      field="brand"
      items={[BASE_ITEM]}
      onSave={onSave}
    />,
  )
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(onSave).toHaveBeenCalledWith('Hacendado')
})

test('Remove button calls onSave(null)', () => {
  const onSave = vi.fn()
  render(
    <TagEditor
      item={BASE_ITEM}
      field="brand"
      items={[BASE_ITEM]}
      onSave={onSave}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))
  expect(onSave).toHaveBeenCalledWith(null)
})

test('Remove button is hidden when field value is null', () => {
  const item = { ...BASE_ITEM, brand: null }
  render(
    <TagEditor item={item} field="brand" items={[item]} onSave={() => {}} />,
  )
  expect(
    screen.queryByRole('button', { name: /eliminar/i }),
  ).not.toBeInTheDocument()
})

test('shows filtered suggestions for brand field', () => {
  render(
    <TagEditor
      item={BASE_ITEM}
      field="brand"
      items={OTHER_ITEMS}
      onSave={() => {}}
    />,
  )
  // typing 'D' should surface Danone
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'D' } })
  expect(screen.getByText('Danone')).toBeInTheDocument()
})

test('clicking a suggestion fills the input', () => {
  render(
    <TagEditor
      item={BASE_ITEM}
      field="brand"
      items={OTHER_ITEMS}
      onSave={() => {}}
    />,
  )
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'D' } })
  fireEvent.click(screen.getByText('Danone'))
  expect(screen.getByRole('textbox')).toHaveValue('Danone')
})

test('does not show suggestions for quantity field', () => {
  render(
    <TagEditor
      item={BASE_ITEM}
      field="quantity"
      items={OTHER_ITEMS}
      onSave={() => {}}
    />,
  )
  // suggestions row should not appear even with matching items
  expect(
    screen.queryByRole('button', { name: /Danone/i }),
  ).not.toBeInTheDocument()
})
