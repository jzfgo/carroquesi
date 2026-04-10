import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { ItemActionSheet } from './ItemActionSheet'
import type { ListItem } from '../types'

const item: ListItem = {
  id: 'i1', list_id: 'l1', name: 'Leche entera',
  quantity: null, brand: null, stores: [],
  purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null,
  added_by: 'u1', created_at: '', updated_at: '',
}

const baseProps = {
  item,
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

test('renders item name in header', () => {
  render(<ItemActionSheet {...baseProps} />)
  expect(screen.getByText('Leche entera')).toBeInTheDocument()
})

test('shows Renombrar and Eliminar buttons', () => {
  render(<ItemActionSheet {...baseProps} />)
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /eliminar producto/i })).toBeInTheDocument()
})

test('tapping overlay calls onClose', () => {
  const { container } = render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(container.querySelector('.item-action-sheet__overlay')!)
  expect(baseProps.onClose).toHaveBeenCalled()
})

test('ESC calls onClose', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})

test('tapping Renombrar shows rename input pre-filled with item name', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  expect(screen.getByRole('textbox')).toHaveValue('Leche entera')
})

test('Guardar button is disabled when input is empty', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
})

test('save calls onRename with trimmed value', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Leche desnatada  ' } })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(baseProps.onRename).toHaveBeenCalledWith('Leche desnatada')
})

test('Enter key triggers save when input is non-empty', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(baseProps.onRename).toHaveBeenCalledWith('Leche entera')
})

test('Cancelar in rename sub-state returns to actions sub-state', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})

test('tapping Eliminar producto shows confirmation sub-state', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
  expect(screen.getByText(/esta acción no se puede deshacer/i)).toBeInTheDocument()
})

test('"Sí, eliminar" calls onDelete', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
  fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
  expect(baseProps.onDelete).toHaveBeenCalled()
})

test('Cancelar in confirmation sub-state returns to actions sub-state', () => {
  render(<ItemActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})
