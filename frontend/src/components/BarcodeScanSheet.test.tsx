import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BarcodeRead } from '../types'
import { BarcodeScanSheet } from './BarcodeScanSheet'

const product: BarcodeRead = {
  ean: '1234567890123',
  name: 'Leche Entera',
  brand: 'Pascual',
  stores: ['Mercadona', 'Alcampo'],
  community_price: null,
  community_price_per: null,
}

const productNoExtras: BarcodeRead = {
  ean: '9876543210987',
  name: 'Producto Genérico',
  brand: null,
  stores: [],
  community_price: null,
  community_price_per: null,
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

  it('renders store chips as selectable buttons when stores present', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /mercadona/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /alcampo/i })).toBeInTheDocument()
  })

  it('no store chips when stores empty', () => {
    render(<BarcodeScanSheet product={productNoExtras} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('store-chips')).not.toBeInTheDocument()
  })

  it('store chips start unselected', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /mercadona/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /alcampo/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a chip toggles its selected state', async () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /mercadona/i })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('add button passes only selected stores to onAdd', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /mercadona/i }))
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: ['Mercadona'] })
  })

  it('add button passes empty stores when none selected', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: [] })
  })

  it('add button passes all selected stores', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /mercadona/i }))
    await userEvent.click(screen.getByRole('button', { name: /alcampo/i }))
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: ['Mercadona', 'Alcampo'] })
  })

  it('add button passes empty stores when no stores on product', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={productNoExtras} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Producto Genérico', brand: null, stores: [] })
  })

  it('edit button calls onEdit with name and brand sigil', async () => {
    const onEdit = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={onEdit} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith('Leche Entera #Pascual')
  })

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  describe('initialBrand override', () => {
    it('shows initialBrand instead of product.brand when provided', () => {
      render(<BarcodeScanSheet product={product} initialBrand="Override" onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByText(/Override/)).toBeInTheDocument()
      expect(screen.queryByText(/Pascual/)).not.toBeInTheDocument()
    })

    it('onAdd payload uses initialBrand when provided', async () => {
      const onAdd = vi.fn()
      render(<BarcodeScanSheet product={product} initialBrand="Override" onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
      expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Override', stores: [] })
    })

    it('uses product.brand when initialBrand is not provided', () => {
      render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByText(/Pascual/)).toBeInTheDocument()
    })
  })

  describe('initialStores pre-selection', () => {
    it('pre-selects stores matching initialStores', () => {
      render(<BarcodeScanSheet product={product} initialStores={['Mercadona']} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByRole('button', { name: /mercadona/i })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /alcampo/i })).toHaveAttribute('aria-pressed', 'false')
    })

    it('onAdd payload includes pre-selected stores', async () => {
      const onAdd = vi.fn()
      render(<BarcodeScanSheet product={product} initialStores={['Mercadona']} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
      expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: ['Mercadona'] })
    })

    it('shows a chip for a store in initialStores that is not in product.stores', () => {
      render(<BarcodeScanSheet product={product} initialStores={['Lidl']} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByRole('button', { name: /lidl/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /lidl/i })).toHaveAttribute('aria-pressed', 'true')
    })

    it('onAdd payload includes an initialStore not present in product.stores', async () => {
      const onAdd = vi.fn()
      render(<BarcodeScanSheet product={product} initialStores={['Lidl']} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
      expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: ['Lidl'] })
    })

    it('shows chips from both product.stores and extra initialStores', () => {
      render(<BarcodeScanSheet product={product} initialStores={['Mercadona', 'Lidl']} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByRole('button', { name: /mercadona/i })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /alcampo/i })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /lidl/i })).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
