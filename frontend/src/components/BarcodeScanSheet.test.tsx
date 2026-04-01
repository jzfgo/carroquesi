import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import type { BarcodeRead } from '../types'

const product: BarcodeRead = {
  name: 'Leche Entera',
  brand: 'Pascual',
  stores: ['Mercadona', 'Alcampo'],
}

const productNoExtras: BarcodeRead = {
  name: 'Producto Genérico',
  brand: null,
  stores: [],
}

describe('BarcodeScanSheet', () => {
  it('renders product name', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Leche Entera')).toBeInTheDocument()
  })

  it('renders brand tag when present', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Pascual/)).toBeInTheDocument()
  })

  it('renders store chips when stores present', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Mercadona')).toBeInTheDocument()
    expect(screen.getByText('Alcampo')).toBeInTheDocument()
  })

  it('does not render store chips when stores empty', () => {
    render(<BarcodeScanSheet product={productNoExtras} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('store-chips')).not.toBeInTheDocument()
  })

  it('edit button calls onEdit with name and brand sigil', async () => {
    const onEdit = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={onEdit} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith('Leche Entera #Pascual')
  })

  it('edit button omits brand sigil when brand is null', async () => {
    const onEdit = vi.fn()
    render(<BarcodeScanSheet product={productNoExtras} onAdd={vi.fn()} onEdit={onEdit} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith('Producto Genérico')
  })

  it('add button calls onAdd with name, brand, and first store', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', store: 'Mercadona' })
  })

  it('add button passes null store when stores is empty', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={productNoExtras} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Producto Genérico', brand: null, store: null })
  })

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
