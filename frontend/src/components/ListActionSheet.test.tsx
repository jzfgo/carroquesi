import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ApiList } from '../types'
import { ListActionSheet } from './ListActionSheet'

const list: ApiList = {
  id: 'l1',
  name: 'Mercado semanal',
  emoji: null,
  owner_id: 'u1',
  created_at: '',
  updated_at: '',
  item_count: 8,
  purchased_count: 3,
}

const baseProps = {
  list,
  isOwner: true,
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

test('renders list name in header', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
})

test('shows Renombrar button', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
})

test('shows Eliminar lista when isOwner is true', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(
    screen.getByRole('button', { name: /eliminar lista/i }),
  ).toBeInTheDocument()
})

test('hides Eliminar lista when isOwner is false', () => {
  render(<ListActionSheet {...baseProps} isOwner={false} />)
  expect(
    screen.queryByRole('button', { name: /eliminar lista/i }),
  ).not.toBeInTheDocument()
})

test('ESC calls onClose from actions sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})

test('tapping Renombrar shows rename input pre-filled with list name', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  expect(screen.getByRole('textbox')).toHaveValue('Mercado semanal')
})

test('Guardar button is disabled when input is empty', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
})

test('save calls onRename with trimmed value', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '  Nuevo nombre  ' },
  })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(baseProps.onRename).toHaveBeenCalledWith('Nuevo nombre')
})

test('Enter key triggers save when input is non-empty', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(baseProps.onRename).toHaveBeenCalledWith('Mercado semanal')
})

test('Cancelar in rename sub-state returns to actions sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})

test('ESC calls onClose from rename sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})

test('tapping Eliminar lista shows confirmation sub-state with warning text', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  expect(
    screen.getByText(/esta acción no se puede deshacer/i),
  ).toBeInTheDocument()
})

test('"Sí, eliminar lista" calls onDelete', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
  expect(baseProps.onDelete).toHaveBeenCalled()
})

test('Cancelar in confirmation sub-state returns to actions sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})

test('tapping the overlay calls onClose from actions sub-state', () => {
  const { container } = render(<ListActionSheet {...baseProps} />)
  fireEvent.click(container.querySelector('.list-action-sheet__overlay')!)
  expect(baseProps.onClose).toHaveBeenCalled()
})

test('ESC calls onClose from confirm-delete sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})
