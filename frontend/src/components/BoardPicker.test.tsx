import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { BOARDS } from '../lib/boards'
import { BoardPicker } from './BoardPicker'

test('offers all six boards, in the order the spec lists them', () => {
  render(<BoardPicker value="kraft" listName="Casa" onChange={vi.fn()} />)
  const swatches = screen.getAllByRole('radio')
  expect(swatches).toHaveLength(6)
  expect(swatches.map((s) => s.getAttribute('data-board'))).toEqual([...BOARDS])
})

test('six squares need names for anyone who cannot see them', () => {
  render(<BoardPicker value="kraft" listName="Casa" onChange={vi.fn()} />)
  expect(screen.getByRole('radio', { name: 'Salvia' })).toBeInTheDocument()
})

test('marks the current board and only that one', () => {
  render(<BoardPicker value="salvia" listName="Casa" onChange={vi.fn()} />)
  expect(screen.getByRole('radio', { name: 'Salvia' })).toBeChecked()
  expect(
    screen
      .getAllByRole('radio')
      .filter((s) => s.getAttribute('aria-checked') === 'true'),
  ).toHaveLength(1)
})

test('choosing a swatch reports it', async () => {
  const onChange = vi.fn()
  render(<BoardPicker value="kraft" listName="Casa" onChange={onChange} />)
  await userEvent.click(screen.getByRole('radio', { name: 'Barro' }))
  expect(onChange).toHaveBeenCalledWith('barro')
})

test('the preview is a check that the material survives the light, not text', () => {
  const { container } = render(
    <BoardPicker value="niebla" listName="Casa" onChange={vi.fn()} />,
  )
  const preview = container.querySelector('.board-picker__preview')
  // It draws the board you are choosing, with a sheet on it.
  expect(preview).toHaveAttribute('data-board', 'niebla')
  expect(preview?.querySelector('.board-picker__preview-sheet')).not.toBeNull()
  expect(screen.getByText('Casa')).toBeInTheDocument()
})

test('carries no explanatory line — rule 20 removed the need for one', () => {
  const { container } = render(
    <BoardPicker value="kraft" listName="Casa" onChange={vi.fn()} />,
  )
  // "Tablero", the six names, and the previewed list name. Nothing that
  // explains what a board is or who else can see it.
  expect(container.textContent).toBe('TableroCasa')
})
