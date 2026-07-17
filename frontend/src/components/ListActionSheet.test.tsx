import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { ListActionSheet } from './ListActionSheet'

vi.mock('./ListMembersSheet', () => ({
  ListMembersSheet: () => (
    <div role="dialog" aria-label="Miembros de la lista">
      Miembros de la lista
    </div>
  ),
}))

const baseProps = {
  listId: 'l1',
  listName: 'Mercado semanal',
  currentUserId: 'u1',
  isOwner: true,
  isDefault: false,
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onSetDefault: vi.fn(),
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

test('shows "Marcar como predeterminada" and fires onSetDefault + onClose when not default', () => {
  render(<ListActionSheet {...baseProps} isDefault={false} />)
  const btn = screen.getByRole('button', {
    name: /marcar como predeterminada/i,
  })
  fireEvent.click(btn)
  expect(baseProps.onSetDefault).toHaveBeenCalledOnce()
  expect(baseProps.onClose).toHaveBeenCalledOnce()
})

test('shows non-actionable "Lista predeterminada" indicator when already default', () => {
  render(<ListActionSheet {...baseProps} isDefault />)
  expect(screen.getByText('Lista predeterminada')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /marcar como predeterminada/i }),
  ).not.toBeInTheDocument()
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

test('ESC from rename sub-state returns to actions, not closing the sheet', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
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

test('ESC from confirm-delete sub-state returns to actions, not closing the sheet', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})
