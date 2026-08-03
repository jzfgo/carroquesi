import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { SmartSearchPill } from './SmartSearchPill'

describe('SmartSearchPill', () => {
  test('shows the query and focuses the field on mount', () => {
    render(
      <SmartSearchPill query="leche" onChange={() => {}} onClose={() => {}} />,
    )
    const input = screen.getByLabelText(
      'Buscar en la lista',
    ) as HTMLInputElement
    expect(input.value).toBe('leche')
    expect(input).toHaveFocus()
  })

  test('typing calls onChange with the value', () => {
    const onChange = vi.fn()
    render(<SmartSearchPill query="" onChange={onChange} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Buscar en la lista'), {
      target: { value: '@mercadona leche' },
    })
    expect(onChange).toHaveBeenCalledWith('@mercadona leche')
  })

  test('clicking the clear mark calls onClose', () => {
    const onClose = vi.fn()
    render(
      <SmartSearchPill query="leche" onChange={() => {}} onClose={onClose} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cerrar búsqueda/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
