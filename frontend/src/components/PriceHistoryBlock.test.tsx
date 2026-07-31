import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChartEntry } from '../lib/priceNormalization'
import { PriceHistoryBlock } from './PriceHistoryBlock'

function entry(over: Partial<ChartEntry> = {}): ChartEntry {
  return {
    displayAmount: 5.34,
    displayPricePer: null,
    store: 'Mercadona',
    purchased_at: '2026-07-22T12:00:00',
    originalAmount: 5.34,
    originalPricePer: null,
    ...over,
  }
}

describe('PriceHistoryBlock', () => {
  it('groups the records by shop, newest shop first', () => {
    render(
      <PriceHistoryBlock
        entries={[
          entry({ store: 'Alcampo', purchased_at: '2026-06-03T12:00:00' }),
          entry({ store: 'Mercadona', purchased_at: '2026-07-22T12:00:00' }),
        ]}
      />,
    )
    const shops = screen.getAllByRole('button').map((b) => b.textContent)
    expect(shops[0]).toMatch(/Mercadona/)
    expect(shops[1]).toMatch(/Alcampo/)
  })

  it('counts the records and dates the last one', () => {
    render(
      <PriceHistoryBlock
        entries={[
          entry({ purchased_at: '2026-07-22T12:00:00' }),
          entry({ purchased_at: '2026-07-15T12:00:00' }),
        ]}
      />,
    )
    expect(screen.getByText('2 precios · último 22 jul')).toBeInTheDocument()
  })

  it('opens a shop where it stands and closes it again', () => {
    render(<PriceHistoryBlock entries={[entry()]} />)
    const row = screen.getByRole('button', { name: /Mercadona/ })

    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Mínimo')).not.toBeInTheDocument()

    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Mínimo')).toBeInTheDocument()

    fireEvent.click(row)
    expect(screen.queryByText('Mínimo')).not.toBeInTheDocument()
  })

  it('keeps its three figures under the names people ask them by', () => {
    render(
      <PriceHistoryBlock
        entries={[
          entry({ displayAmount: 5.34, originalAmount: 5.34 }),
          entry({
            displayAmount: 5.1,
            originalAmount: 5.1,
            purchased_at: '2026-07-15T12:00:00',
          }),
          entry({
            displayAmount: 5.49,
            originalAmount: 5.49,
            purchased_at: '2026-07-08T12:00:00',
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    for (const [label, figure] of [
      ['Mínimo', '5,10'],
      ['Máximo', '5,49'],
      ['Último', '5,34'],
    ]) {
      expect(screen.getByText(label).textContent).toContain(figure)
    }
  })

  // The three figures have to sit on one scale. When a history normalises,
  // only the records that converted hold €/kg — reaching past them to an
  // unconverted figure prints a per-unit price under a per-kilo label, which
  // is a price nobody paid.
  it('computes its three figures only from records on the same scale', () => {
    render(
      <PriceHistoryBlock
        entries={[
          // Newest, but per unit: it never converted, so it is not comparable.
          entry({
            originalAmount: 0.65,
            displayAmount: null,
            displayPricePer: 'KILOGRAM',
          }),
          entry({
            originalAmount: 1.49,
            displayAmount: 0.99,
            displayPricePer: 'KILOGRAM',
            purchased_at: '2026-07-15T12:00:00',
          }),
          entry({
            originalAmount: 1.05,
            displayAmount: 1.05,
            displayPricePer: 'KILOGRAM',
            purchased_at: '2026-07-08T12:00:00',
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    expect(screen.getByText('Mínimo').textContent).toContain('0,99/kg')
    expect(screen.getByText('Máximo').textContent).toContain('1,05/kg')
    // The newest *comparable* record, not the newest record.
    expect(screen.getByText('Último').textContent).toContain('0,99/kg')
    expect(screen.getByText('Último').textContent).not.toContain('0,65')
  })

  it('has nothing to say when no record converted', () => {
    render(
      <PriceHistoryBlock
        entries={[
          entry({
            originalAmount: 0.65,
            displayAmount: null,
            displayPricePer: 'KILOGRAM',
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    expect(screen.getByText('Mínimo').textContent).toContain('—')
  })

  // A screenshot cannot guard either of the next two. The ≈ is one glyph and
  // the ink of «sin precio» is a colour swap — both cost far less than the
  // suite's 250px absolute budget, so a baseline stays green without them.
  it('marks a converted amount with ≈, beside the figure that was confirmed', () => {
    render(
      <PriceHistoryBlock
        entries={[
          entry({
            originalAmount: 5.49,
            originalPricePer: null,
            displayAmount: 0.92,
            displayPricePer: 'KILOGRAM',
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    // Scoped to the opened shop: the collapsed row shows the figure too.
    const detail = within(document.querySelector('.phb__detail')!)
    const record = detail.getByText('5,49', { exact: false })
    // The recorded figure leads; the derived one follows it, carrying its ≈.
    expect(record.textContent).toBe('5,49≈ 0,92/kg')
  })

  it('does not mark an amount that was never converted', () => {
    render(<PriceHistoryBlock entries={[entry()]} />)
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })

  it('says «sin precio» for a shop that wrote nothing down', () => {
    render(
      <PriceHistoryBlock
        entries={[entry({ originalAmount: null, displayAmount: null })]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))
    expect(screen.getByText('sin precio')).toBeInTheDocument()
  })

  it('says it in a different ink, not at a lower opacity (rule 5)', () => {
    render(
      <PriceHistoryBlock
        entries={[
          entry({ originalAmount: null, displayAmount: null }),
          entry({ purchased_at: '2026-07-15T12:00:00' }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    // The list of records, not the whole detail: «Último» repeats the figure.
    const records = within(document.querySelector('.phb__records')!)
    const none = getComputedStyle(records.getByText('sin precio'))

    // jsdom hands back the declaration as written, var() and all — it resolves
    // nothing. So the token has to be named. Comparing against the neighbouring
    // row instead would prove nothing: with the rule deleted this inherits
    // jsdom's rgb(0, 0, 0), which differs from the neighbour just as well.
    expect(none.color).toBe('var(--fg-subtle)')
    // Rule 5 in the other direction: quieter is a change of ink, never a
    // change of opacity.
    expect(none.opacity).toBe('1')
  })

  it('offers to record a price only when there is somewhere to record it', () => {
    const onLogPrice = vi.fn()
    const { rerender } = render(
      <PriceHistoryBlock entries={[entry()]} onLogPrice={onLogPrice} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Registrar un precio/ }))
    expect(onLogPrice).toHaveBeenCalled()

    rerender(<PriceHistoryBlock entries={[entry()]} />)
    expect(
      screen.queryByRole('button', { name: /Registrar un precio/ }),
    ).not.toBeInTheDocument()
  })

  it('names the group for a record with no shop', () => {
    render(<PriceHistoryBlock entries={[entry({ store: null })]} />)
    expect(
      screen.getByRole('button', { name: /Sin tienda/ }),
    ).toBeInTheDocument()
  })

  it('says so plainly when there is no history at all', () => {
    render(<PriceHistoryBlock entries={[]} />)
    expect(screen.getByText('Todavía no hay precios.')).toBeInTheDocument()
  })

  it('shows every shop at full strength while one is open (rule 5)', () => {
    render(
      <PriceHistoryBlock
        entries={[
          entry({ store: 'Mercadona' }),
          entry({ store: 'Alcampo', purchased_at: '2026-06-03T12:00:00' }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mercadona/ }))

    const alcampo = screen.getByRole('button', { name: /Alcampo/ })
    const style = getComputedStyle(alcampo.closest('.phb__store')!)
    expect(style.opacity === '' || style.opacity === '1').toBe(true)
    expect(within(alcampo).getByText('5,34')).toBeInTheDocument()
  })
})
