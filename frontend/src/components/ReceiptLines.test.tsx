import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import { ReceiptLines } from './ReceiptLines'

/** Three days back, so every line is settled rather than in today's cart. */
const EARLIER = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 19)
})()

const lines = (n: number): ListItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `i${i}`,
    list_id: 'l1',
    name: `Producto ${i}`,
    quantity: null,
    purchased_quantity: null,
    brand: null,
    stores: [],
    purchased: true,
    purchased_at: EARLIER,
    ean: null,
    price: 1,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '',
    updated_at: '',
  }))

const renderLines = (n: number) =>
  render(
    <ReceiptLines
      items={lines(n)}
      onTogglePurchased={vi.fn()}
      onOpen={vi.fn()}
      onClone={vi.fn()}
    />,
  )

describe('a receipt short enough to read whole', () => {
  it('prints every line, with nothing to unfold', () => {
    const { container } = renderLines(4)
    expect(container.querySelectorAll('.item-card')).toHaveLength(4)
    expect(container.querySelector('.receipt-lines__more')).toBeNull()
  })
})

describe('a receipt too long to print whole', () => {
  it('shows four and says exactly how many it is not showing', () => {
    const { container } = renderLines(16)
    expect(container.querySelectorAll('.item-card')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '12 líneas más' })).toBeVisible()
  })

  it('counts one folded line in the singular', () => {
    renderLines(5)
    expect(screen.getByRole('button', { name: '1 línea más' })).toBeVisible()
  })

  it('unfolds in place, rather than going anywhere', () => {
    const { container } = renderLines(16)
    fireEvent.click(screen.getByRole('button', { name: '12 líneas más' }))
    expect(container.querySelectorAll('.item-card')).toHaveLength(16)
  })

  it('folds back up again', () => {
    const { container } = renderLines(16)
    const fold = screen.getByRole('button', { name: '12 líneas más' })
    fireEvent.click(fold)
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(container.querySelectorAll('.item-card')).toHaveLength(4)
  })

  it('says whether it is open, for anyone who cannot see that it is', () => {
    renderLines(16)
    const fold = screen.getByRole('button', { name: '12 líneas más' })
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(fold)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})
