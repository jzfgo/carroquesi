import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import type { ListItem, Member, PriceEntry } from '../types'
import { ItemDetailSheet } from './ItemDetailSheet'

vi.mock('../lib/api')

const getToken = vi.fn(async () => 'token')

function makeItem(over: Partial<ListItem> = {}): ListItem {
  return {
    id: 'i1',
    list_id: 'l1',
    name: 'Leche entera',
    quantity: '6 ud',
    brand: 'Puleva',
    stores: ['Mercadona', 'Alcampo'],
    purchased: false,
    purchased_at: null,
    ean: '8410188012374',
    price: 5.34,
    price_per: null,
    price_store: 'Mercadona',
    added_by: 'u1',
    created_at: '2026-07-18T12:00:00',
    updated_at: '2026-07-18T12:00:00',
    ...over,
  }
}

function priceEntry(over: Partial<PriceEntry> = {}): PriceEntry {
  return {
    amount: 5.34,
    price_per: null,
    store: 'Mercadona',
    purchased_at: '2026-07-22T12:00:00',
    quantity: null,
    ...over,
  }
}

const members = new Map<string, Member>([
  [
    'u1',
    {
      id: 'u1',
      displayName: 'Marta',
      initial: 'M',
      color: '#000',
      photoUrl: null,
    },
  ],
])

function renderSheet(over: Partial<ListItem> = {}, props = {}) {
  return render(
    <ItemDetailSheet
      item={makeItem(over)}
      listId="l1"
      getToken={getToken}
      members={members}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      onTagClick={vi.fn()}
      onLogPrice={vi.fn()}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.mocked(api.getPriceHistory).mockResolvedValue({
    entries: [priceEntry()],
    community_price: null,
    community_price_per: null,
  })
})

describe('ItemDetailSheet', () => {
  it('is named by the item, and says its brand and shops under it', async () => {
    renderSheet()
    expect(
      screen.getByRole('dialog', { name: 'Leche entera' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Puleva · en Mercadona y Alcampo'),
    ).toBeInTheDocument()
  })

  it('answers what it costs before anything else', async () => {
    renderSheet()
    expect(screen.getByText('€ 5,34')).toBeInTheDocument()
  })

  // A price here is always per unit or per weight. The figure alone does not
  // say which, so the line under it does — once, and not on the figure too.
  it('says what the price is per, and says it once', () => {
    renderSheet()
    expect(screen.getByText(/^la unidad · Mercadona/)).toBeInTheDocument()
    expect(screen.getByText('€ 5,34')).toBeInTheDocument()
  })

  it('says el kilo for a price by weight', () => {
    renderSheet({ price_per: 'KILOGRAM' })
    expect(screen.getByText(/^el kilo · Mercadona/)).toBeInTheDocument()
    // Not "€ 5,34/kg": the basis belongs in one place (rule 3).
    expect(screen.getByText('€ 5,34')).toBeInTheDocument()
  })

  it('does not name a basis when there is no price to have one', () => {
    renderSheet({ price: null, price_store: null })
    expect(screen.queryByText(/la unidad|el kilo/)).not.toBeInTheDocument()
  })

  // The quantity has its own row. Repeating it here would be one fact in two
  // places on one screen.
  it('does not repeat the quantity above the record it belongs to', () => {
    renderSheet({ quantity: '6 ud' })
    expect(screen.getByText('6 ud')).toBeInTheDocument()
    expect(screen.getAllByText('6 ud')).toHaveLength(1)
  })

  it('says so plainly when nothing has been paid yet', () => {
    renderSheet({ price: null })
    expect(screen.getByText('Todavía sin precio')).toBeInTheDocument()
  })

  // 22a retires it: a figure that does not match this house is not a fact
  // about this house.
  it('never shows a community price', async () => {
    vi.mocked(api.getPriceHistory).mockResolvedValue({
      entries: [priceEntry()],
      community_price: 4.99,
      community_price_per: null,
    })
    renderSheet()
    await waitFor(() =>
      expect(screen.getByText('Mercadona')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/4,99/)).not.toBeInTheDocument()
    expect(screen.queryByText(/estimado/i)).not.toBeInTheDocument()
  })

  // «la ficha enseña todo lo que has pagado tú, sin conmutador»
  it('reads every price of yours, with no scope to choose', async () => {
    renderSheet()
    await waitFor(() =>
      expect(api.getPriceHistory).toHaveBeenCalledWith(
        getToken,
        'l1',
        'i1',
        'my_lists',
      ),
    )
    expect(screen.queryByRole('button', { name: 'Esta lista' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Todos' })).toBeNull()
  })

  it('routes each product row to the editor that field already had', () => {
    const onTagClick = vi.fn()
    renderSheet({}, { onTagClick })

    fireEvent.click(screen.getByRole('button', { name: /^Marca/ }))
    expect(onTagClick).toHaveBeenCalledWith('brand')

    fireEvent.click(screen.getByRole('button', { name: /^Cantidad/ }))
    expect(onTagClick).toHaveBeenCalledWith('quantity')

    fireEvent.click(screen.getByRole('button', { name: /^Tiendas/ }))
    expect(onTagClick).toHaveBeenCalledWith('stores')
  })

  // The scanner is the one way an EAN gets set, so the row states the code
  // and offers no second path to it.
  it('shows the code without making it a control', () => {
    renderSheet()
    expect(screen.getByText('8410188012374')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Código/ })).toBeNull()
  })

  it('leaves the code row out when there is no code', () => {
    renderSheet({ ean: null })
    expect(screen.queryByText('Código')).not.toBeInTheDocument()
  })

  it('writes the trail as a sentence', async () => {
    renderSheet()
    await waitFor(() =>
      expect(
        screen.getByText(/Lo añadió Marta el 18 jul\./),
      ).toBeInTheDocument(),
    )
  })

  // The handoff drew no purchased variant. The app's own rule decides it.
  it('stops offering the editors once the item is bought', () => {
    renderSheet({ purchased: true, purchased_at: '2026-07-22T12:00:00' })

    for (const field of ['Nombre', 'Marca', 'Cantidad', 'Tiendas']) {
      expect(screen.getByText(field)).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: new RegExp(`^${field}`) }),
      ).toBeNull()
    }
  })

  it('offers to buy it again only once it has been bought', () => {
    const onClone = vi.fn()
    const { rerender } = renderSheet({}, { onClone })
    expect(
      screen.queryByRole('button', { name: /volver a comprar/i }),
    ).toBeNull()

    rerender(
      <ItemDetailSheet
        item={makeItem({ purchased: true })}
        listId="l1"
        getToken={getToken}
        members={members}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onTagClick={vi.fn()}
        onLogPrice={vi.fn()}
        onClone={onClone}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /volver a comprar/i }))
    expect(onClone).toHaveBeenCalled()
  })

  it('renames through its own step, and only on confirmation', () => {
    const onRename = vi.fn()
    renderSheet({}, { onRename })

    fireEvent.click(screen.getByRole('button', { name: /^Nombre/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Leche desnatada' },
    })
    expect(onRename).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onRename).toHaveBeenCalledWith('Leche desnatada')
  })

  it('will not save an empty name', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /^Nombre/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: '   ' },
    })
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('asks before deleting, and closing the question does not delete', () => {
    const onDelete = vi.fn()
    renderSheet({}, { onDelete })

    fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('does not offer to delete an item whose trip has been filed', () => {
    renderSheet({ purchase_filed: true })
    expect(
      screen.queryByRole('button', { name: /eliminar producto/i }),
    ).toBeNull()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderSheet({}, { onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('still opens when the history cannot be read', async () => {
    vi.mocked(api.getPriceHistory).mockRejectedValue(new Error('offline'))
    renderSheet()
    await waitFor(() =>
      expect(screen.getByText('Todavía no hay precios.')).toBeInTheDocument(),
    )
    expect(screen.getByText('€ 5,34')).toBeInTheDocument()
  })
})
