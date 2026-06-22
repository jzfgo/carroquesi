import { render, screen } from '@testing-library/react'
import { Mascot } from './Mascot'

test('renders img with correct alt text', () => {
  render(<Mascot />)
  expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
})

test('applies default size of 160', () => {
  render(<Mascot />)
  const img = screen.getByRole('img')
  expect(img).toHaveAttribute('width', '160')
  expect(img).toHaveAttribute('height', '160')
})

test('applies custom size prop', () => {
  render(<Mascot size={80} />)
  const img = screen.getByRole('img')
  expect(img).toHaveAttribute('width', '80')
  expect(img).toHaveAttribute('height', '80')
})
