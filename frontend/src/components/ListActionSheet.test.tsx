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
  listEmoji: null as string | null,
  currentUserId: 'u1',
  ownerId: 'u1',
  isDefault: false,
  onRename: vi.fn(),
  onEmojiChange: vi.fn(),
  onDelete: vi.fn(),
  onSetDefault: vi.fn(),
  onDefaultLocked: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

const nameField = () => screen.getByLabelText('Nombre de la lista')

test('name is a top field pre-filled with the list name', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(nameField()).toHaveValue('Mercado semanal')
})

test('editing the name and blurring saves the trimmed value (no Guardar)', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.change(nameField(), { target: { value: '  Nuevo nombre  ' } })
  fireEvent.blur(nameField())
  expect(baseProps.onRename).toHaveBeenCalledWith('Nuevo nombre')
  // No save button in the redesign.
  expect(
    screen.queryByRole('button', { name: /guardar/i }),
  ).not.toBeInTheDocument()
})

test('blurring an unchanged name does not call onRename', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.blur(nameField())
  expect(baseProps.onRename).not.toHaveBeenCalled()
})

test('emoji grid: picking an emoji calls onEmojiChange, ∅ clears it', () => {
  render(<ListActionSheet {...baseProps} listEmoji="🥛" />)
  fireEvent.click(screen.getByRole('button', { name: '🍎' }))
  expect(baseProps.onEmojiChange).toHaveBeenCalledWith('🍎')
  fireEvent.click(screen.getByRole('button', { name: 'Ninguno' }))
  expect(baseProps.onEmojiChange).toHaveBeenCalledWith(null)
})

test('board picker: swatches render, active is pressed, picking calls onBoardChange', () => {
  const onBoardChange = vi.fn()
  render(
    <ListActionSheet
      {...baseProps}
      board="kraft"
      onBoardChange={onBoardChange}
    />,
  )
  expect(screen.getByRole('button', { name: 'kraft' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'salvia' }))
  expect(onBoardChange).toHaveBeenCalledWith('salvia')
})

test('board picker is hidden without board/onBoardChange (dashboard path)', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(
    screen.queryByRole('button', { name: 'kraft' }),
  ).not.toBeInTheDocument()
})

test('default switch is off and setting it calls onSetDefault', () => {
  render(<ListActionSheet {...baseProps} isDefault={false} />)
  const sw = screen.getByRole('switch', { name: 'Lista predeterminada' })
  expect(sw).toHaveAttribute('aria-checked', 'false')
  expect(sw).not.toHaveAttribute('aria-disabled')
  fireEvent.click(sw)
  expect(baseProps.onSetDefault).toHaveBeenCalledOnce()
  expect(baseProps.onDefaultLocked).not.toHaveBeenCalled()
})

test('default switch on is locked: announced non-operable, tap explains instead of unsetting', () => {
  render(<ListActionSheet {...baseProps} isDefault />)
  const sw = screen.getByRole('switch', { name: 'Lista predeterminada' })
  expect(sw).toHaveAttribute('aria-checked', 'true')
  expect(sw).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(sw)
  expect(baseProps.onSetDefault).not.toHaveBeenCalled()
  expect(baseProps.onDefaultLocked).toHaveBeenCalledOnce()
})

test('members row shows the "N de 5" count and opens the members sheet', () => {
  render(<ListActionSheet {...baseProps} memberCount={3} />)
  expect(screen.getByText('3 de 5')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /miembros/i }))
  expect(
    screen.getByRole('dialog', { name: 'Miembros de la lista' }),
  ).toBeInTheDocument()
})

test('shows Eliminar lista for the owner, hides it for others', () => {
  const { rerender } = render(<ListActionSheet {...baseProps} />)
  expect(
    screen.getByRole('button', { name: /eliminar lista/i }),
  ).toBeInTheDocument()
  rerender(<ListActionSheet {...baseProps} ownerId="u2" />)
  expect(
    screen.queryByRole('button', { name: /eliminar lista/i }),
  ).not.toBeInTheDocument()
})

test('delete flows through the confirmation and calls onDelete', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  expect(
    screen.getByText(/esta acción no se puede deshacer/i),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
  expect(baseProps.onDelete).toHaveBeenCalled()
})

test('Tiendas row is hidden when the registry is empty', () => {
  render(
    <ListActionSheet
      {...baseProps}
      storeEntries={[]}
      onRenameStore={vi.fn()}
    />,
  )
  expect(
    screen.queryByRole('button', { name: /tiendas/i }),
  ).not.toBeInTheDocument()
})

test('renames a store inline (save on blur) in the stores sub-sheet', () => {
  const onRenameStore = vi.fn()
  render(
    <ListActionSheet
      {...baseProps}
      storeEntries={[
        { store_key: 'ahorramas', display_name: 'Ahorra Más' },
        { store_key: 'lidl', display_name: 'Lidl' },
      ]}
      onRenameStore={onRenameStore}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /tiendas/i }))
  fireEvent.click(screen.getByRole('button', { name: /renombrar ahorra más/i }))
  const input = screen.getByRole('textbox', { name: /nombre de ahorra más/i })
  fireEvent.change(input, { target: { value: 'Ahorramas' } })
  fireEvent.blur(input)
  expect(onRenameStore).toHaveBeenCalledWith('ahorramas', 'Ahorramas')
})

test('dismissing a sub-sheet goes back to the menu, not closing', () => {
  render(
    <ListActionSheet
      {...baseProps}
      storeEntries={[{ store_key: 'lidl', display_name: 'Lidl' }]}
      onRenameStore={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /tiendas/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(nameField()).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})

test('ESC from the main menu closes the sheet', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})
