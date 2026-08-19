import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ListHeader } from './ListHeader'

const baseProps = {
  title: 'Semana',
  emoji: '🥑',
  onMenuOpen: vi.fn(),
}

test('renders the title with its emoji, search and menu', () => {
  const onSearch = vi.fn()
  render(<ListHeader {...baseProps} onSearch={onSearch} />)
  expect(screen.getByRole('heading', { name: /Semana/ })).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Buscar en la lista'))
  expect(onSearch).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Abrir menú')).toBeInTheDocument()
})

test('the search slot takes the title area: title and actions give way, back stays', () => {
  const onBack = vi.fn()
  render(
    <ListHeader
      {...baseProps}
      onBack={onBack}
      onSearch={vi.fn()}
      searchSlot={<div data-testid="pill" />}
    />,
  )
  expect(screen.getByTestId('pill')).toBeInTheDocument()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Buscar en la lista')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Abrir menú')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Volver')).toBeInTheDocument()
})
