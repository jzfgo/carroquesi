import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ListCard } from './ListCard'
import type { ApiList } from '../types'

const makeList = (overrides: Partial<ApiList> = {}): ApiList => ({
  id: 'l1',
  name: 'Mercado semanal',
  owner_id: 'u1',
  created_at: '',
  updated_at: '',
  item_count: 8,
  purchased_count: 3,
  ...overrides,
})

describe('ListCard', () => {
  it('shows the list name', () => {
    render(<ListCard list={makeList()} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
  })

  it('shows "X de Y comprados" subtitle when items exist', () => {
    render(<ListCard list={makeList({ item_count: 8, purchased_count: 3 })} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.getByText('3 de 8 comprados')).toBeInTheDocument()
  })

  it('hides subtitle when item_count is 0', () => {
    render(<ListCard list={makeList({ item_count: 0, purchased_count: 0 })} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.queryByText(/comprados/)).not.toBeInTheDocument()
  })

  it('calls onClick when tap-target is clicked', () => {
    const onClick = vi.fn()
    render(<ListCard list={makeList()} onClick={onClick} onMenuOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /mercado semanal/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('⋯ button is present', () => {
    render(<ListCard list={makeList()} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /opciones/i })).toBeInTheDocument()
  })

  it('tapping ⋯ calls onMenuOpen', () => {
    const onMenuOpen = vi.fn()
    render(<ListCard list={makeList()} onClick={vi.fn()} onMenuOpen={onMenuOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    expect(onMenuOpen).toHaveBeenCalledOnce()
  })

  it('tapping ⋯ does not call onClick', () => {
    const onClick = vi.fn()
    render(<ListCard list={makeList()} onClick={onClick} onMenuOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
