import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { FilterBar } from './FilterBar'

describe('FilterBar', () => {
  test('renders nothing when there are no stores', () => {
    const { container } = render(
      <FilterBar stores={[]} query="" onChange={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('renders the store chips with no search magnifier', () => {
    render(
      <FilterBar stores={['Mercadona', 'Lidl']} query="" onChange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mercadona' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lidl' })).toBeInTheDocument()
    // Search moved to the header (21b); the chips row carries no magnifier.
    expect(
      screen.queryByRole('button', { name: /buscar/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  test('"Todas" chip is active (aria-pressed=true) when query is empty', () => {
    render(<FilterBar stores={['Mercadona']} query="" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Mercadona' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('store chip is active when query is "@StoreName"', () => {
    render(
      <FilterBar
        stores={['Mercadona', 'Lidl']}
        query="@Mercadona"
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Mercadona' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Lidl' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('store chip is active for a spelling variant of its name', () => {
    // The query may carry another member's typing of the same shop.
    render(
      <FilterBar
        stores={['Ahorramás', 'Lidl']}
        query="@AHORRA MAS"
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Ahorramás' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Lidl' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('clicking a store chip calls onChange with "@StoreName"', () => {
    const onChange = vi.fn()
    render(<FilterBar stores={['Mercadona']} query="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    expect(onChange).toHaveBeenCalledWith('@Mercadona')
  })

  test('clicking "Todas" chip calls onChange with ""', () => {
    const onChange = vi.fn()
    render(
      <FilterBar
        stores={['Mercadona']}
        query="@Mercadona"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
