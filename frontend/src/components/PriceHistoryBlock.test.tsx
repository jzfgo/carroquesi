import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { PriceEntry } from '../types'
import { PriceHistoryBlock } from './PriceHistoryBlock'

function entry(over: Partial<PriceEntry> = {}): PriceEntry {
  return {
    amount: 5.34,
    is_sin_precio: false,
    price_per: null,
    purchased_at: '2026-07-22T10:00:00Z',
    quantity: '1 ud',
    store: 'Mercadona',
    ...over,
  }
}

const identity = (raw: string) => raw

test('a store expands in place and its records appear', () => {
  render(
    <PriceHistoryBlock
      entries={[
        entry({
          store: 'Mercadona',
          purchased_at: '2026-07-22T10:00:00Z',
          amount: 5.34,
        }),
        entry({
          store: 'Mercadona',
          purchased_at: '2026-07-15T10:00:00Z',
          amount: 5.1,
        }),
      ]}
      displayStore={identity}
    />,
  )

  // Collapsed: no record rows yet.
  expect(screen.queryByText('Mínimo')).not.toBeInTheDocument()

  fireEvent.click(screen.getByText('Mercadona'))

  expect(screen.getByText('Mínimo')).toBeInTheDocument()
  expect(screen.getByText('Máximo')).toBeInTheDocument()
  expect(screen.getByText('Último')).toBeInTheDocument()
  expect(screen.getByText('22 jul')).toBeInTheDocument()
  expect(screen.getByText('15 jul')).toBeInTheDocument()
})

test('expanding one store leaves its siblings at full ink — no dimming', () => {
  render(
    <PriceHistoryBlock
      entries={[
        entry({ store: 'Mercadona', purchased_at: '2026-07-22T10:00:00Z' }),
        entry({
          store: 'Alcampo',
          purchased_at: '2026-06-03T10:00:00Z',
          amount: 5.79,
        }),
      ]}
      displayStore={identity}
    />,
  )

  fireEvent.click(screen.getByText('Mercadona'))

  const sibling = screen.getByText('Alcampo').closest('button')!
  // Rule 5: dimming is a change of ink, not a drop in opacity — the sibling
  // must keep both.
  expect(sibling.className).not.toMatch(/dim/i)
  const opacity = getComputedStyle(sibling).opacity
  expect(['', '1']).toContain(opacity)
})

test('a price-less purchase renders a real "sin precio" record, never hidden', () => {
  render(
    <PriceHistoryBlock
      entries={[
        entry({
          store: 'Mercadona',
          purchased_at: '2026-07-22T10:00:00Z',
          amount: 5.34,
        }),
        entry({
          store: 'Mercadona',
          purchased_at: '2026-07-01T10:00:00Z',
          amount: null,
          is_sin_precio: true,
        }),
      ]}
      displayStore={identity}
    />,
  )

  fireEvent.click(screen.getByText('Mercadona'))

  expect(screen.getByText('sin precio')).toBeInTheDocument()
  expect(screen.getByText('1 jul')).toBeInTheDocument()
})

test('a normalized amount carries its ≈ €/kg marker', () => {
  render(
    <PriceHistoryBlock
      entries={[
        entry({
          store: 'Mercadona',
          purchased_at: '2026-07-22T10:00:00Z',
          amount: 2.0,
          quantity: '500 g',
          price_per: null,
        }),
      ]}
      displayStore={identity}
    />,
  )

  fireEvent.click(screen.getByText('Mercadona'))

  // 2,00 for 500 g normalises to 4,00/kg.
  expect(screen.getByText(/≈ 4,00\/kg/)).toBeInTheDocument()
})

test('the ficha price block carries no scope switcher', () => {
  render(<PriceHistoryBlock entries={[entry()]} displayStore={identity} />)
  expect(screen.queryByText('Esta lista')).not.toBeInTheDocument()
  expect(screen.queryByText('Mis listas')).not.toBeInTheDocument()
  expect(screen.queryByText('Todos')).not.toBeInTheDocument()
})

test('the "Registrar un precio" row appears only when a handler is given', () => {
  const { rerender } = render(
    <PriceHistoryBlock entries={[entry()]} displayStore={identity} />,
  )
  expect(screen.queryByText('Registrar un precio')).not.toBeInTheDocument()

  rerender(
    <PriceHistoryBlock
      entries={[entry()]}
      displayStore={identity}
      onLogPrice={() => {}}
    />,
  )
  expect(screen.getByText('Registrar un precio')).toBeInTheDocument()
})
