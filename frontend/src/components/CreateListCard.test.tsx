import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CreateListCard } from './CreateListCard'

describe('CreateListCard', () => {
  it('shows "Crea tu primera lista" when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(screen.getByText(/primera lista/i)).toBeInTheDocument()
  })

  it('shows "+ Nueva lista" when not isFirst', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    expect(screen.getByText(/nueva lista/i)).toBeInTheDocument()
  })

  it('expands to input when clicked', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument()
  })

  it('confirm button is disabled when name is empty', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: /crear/i })).toBeDisabled()
  })

  it('calls onCreate with the typed name and collapses', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Costco'))
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/nombre/i)).not.toBeInTheDocument(),
    )
  })

  it('ESC key collapses the input and clears the name', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText(/nombre/i), { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/nombre/i)).not.toBeInTheDocument()
    // After re-expand, input should be empty
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('')
  })

  it('ENTER key submits the form', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Mercado' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText(/nombre/i), { key: 'Enter' })
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Mercado'))
  })
})
