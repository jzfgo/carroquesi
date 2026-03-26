import { render, screen, fireEvent } from '@testing-library/react'
import { StoreFilter } from './StoreFilter'

test('renders nothing when no stores provided', () => {
  const { container } = render(<StoreFilter stores={[]} active={null} onSelect={() => {}} />)
  expect(container.firstChild).toBeNull()
})

test('renders Todas chip plus one chip per store', () => {
  render(<StoreFilter stores={['Mercadona', 'Lidl']} active={null} onSelect={() => {}} />)
  expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mercadona' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Lidl' })).toBeInTheDocument()
})

test('Todas chip is active when active is null', () => {
  render(<StoreFilter stores={['Mercadona']} active={null} onSelect={() => {}} />)
  expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Mercadona' })).toHaveAttribute('aria-pressed', 'false')
})

test('store chip is active when it matches active prop', () => {
  render(<StoreFilter stores={['Mercadona', 'Lidl']} active="Mercadona" onSelect={() => {}} />)
  expect(screen.getByRole('button', { name: 'Mercadona' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Lidl' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false')
})

test('tapping a store chip calls onSelect with that store', () => {
  const onSelect = vi.fn()
  render(<StoreFilter stores={['Mercadona']} active={null} onSelect={onSelect} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
  expect(onSelect).toHaveBeenCalledWith('Mercadona')
})

test('tapping Todas chip calls onSelect with null', () => {
  const onSelect = vi.fn()
  render(<StoreFilter stores={['Mercadona']} active="Mercadona" onSelect={onSelect} />)
  fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
  expect(onSelect).toHaveBeenCalledWith(null)
})
