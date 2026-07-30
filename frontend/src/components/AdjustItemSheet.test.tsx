import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdjustItemSheet } from './AdjustItemSheet'

const base = {
  key: 'k1',
  itemId: 'a',
  name: 'Tomates pera',
  brand: null,
  quantity: '1,12 kg',
  price: null,
  pricePer: null,
  included: true,
  fromCart: true,
}

describe('AdjustItemSheet', () => {
  it('hands back what was typed', async () => {
    const onDone = vi.fn()
    render(<AdjustItemSheet line={base} onDone={onDone} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Precio'), '2.49')
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ price: 2.49, quantity: '1,12 kg' }),
    )
  })

  it('derives per-kilo from a weight quantity', async () => {
    render(<AdjustItemSheet line={base} onDone={vi.fn()} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Precio'), '2.49')

    expect(screen.getByText('€/kg')).toBeInTheDocument()
  })

  it('refuses a blank name on a new line', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={{ ...base, itemId: null, name: '' }}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Hecho' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).not.toHaveBeenCalled()
  })

  // The backend refuses a unit with no amount to apply it to, and refuses the
  // whole sheet with it. A weight left unpriced is an ordinary thing to hand
  // back, so the unit has to come off with the price.
  it('leaves the unit off a line with no price', async () => {
    const onDone = vi.fn()
    render(<AdjustItemSheet line={base} onDone={onDone} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ price: null, pricePer: null }),
    )
  })

  it('marks the unit as per-kilo once a weight has a price', async () => {
    const onDone = vi.fn()
    render(<AdjustItemSheet line={base} onDone={onDone} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Precio'), '2.49')
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ pricePer: 'KILOGRAM' }),
    )
  })

  it('reads a price written with a decimal comma', async () => {
    const onDone = vi.fn()
    render(<AdjustItemSheet line={base} onDone={onDone} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Precio'), '2,49')
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ price: 2.49 }),
    )
  })

  it('reads a price written with a thousands dot', async () => {
    const onDone = vi.fn()
    render(<AdjustItemSheet line={base} onDone={onDone} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Precio'), '1.234,56')
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ price: 1234.56 }),
    )
  })

  // The backend rejects the whole close over one negative amount, so the
  // household would lose the entire sheet at the door over a stray minus.
  it('refuses a negative price', async () => {
    const onDone = vi.fn()
    render(<AdjustItemSheet line={base} onDone={onDone} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Precio'), '-5')

    expect(screen.getByRole('button', { name: 'Hecho' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).not.toHaveBeenCalled()
  })

  it('trims every field it hands back', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={{ ...base, itemId: null, name: '', quantity: null }}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    await userEvent.type(screen.getByLabelText('Producto'), '  Pan de molde  ')
    await userEvent.type(screen.getByLabelText('Cantidad'), '  2  ')
    await userEvent.type(screen.getByLabelText('Marca · opcional'), ' Bimbo ')
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Pan de molde',
        brand: 'Bimbo',
        quantity: '2',
      }),
    )
  })

  it('hands back nothing for a field left blank', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={{ ...base, quantity: null }}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ brand: null, quantity: null }),
    )
  })

  it('keeps a price and a unit it was given and nobody touched', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={{ ...base, price: 1.19 }}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    // The fixture's quantity reads as a weight, but its stored unit is per
    // item. Opening the row and pressing Hecho is not an edit, so neither
    // figure moves.
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ price: 1.19, pricePer: null }),
    )
  })

  it('closes without handing anything back', async () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    render(<AdjustItemSheet line={base} onDone={onDone} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('titles itself for something that was never on the list', () => {
    render(
      <AdjustItemSheet
        line={{ ...base, itemId: null, name: '' }}
        onDone={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Añadir producto')).toBeInTheDocument()
  })
})

describe('AdjustItemSheet and a unit nobody changed', () => {
  // Priced per unit, but the quantity happens to read as a weight. Deriving
  // the unit from that text alone would re-declare the row per kilo just for
  // being opened.
  const perUnitWithAWeight = {
    ...base,
    quantity: '500 g',
    price: 2.5,
    pricePer: null,
  }

  it('keeps the stored unit when nothing was edited', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={perUnitWithAWeight}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ pricePer: null, price: 2.5 }),
    )
  })

  it('says per unit while the row is untouched', () => {
    render(
      <AdjustItemSheet
        line={perUnitWithAWeight}
        onDone={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // The suffix has to promise what Hecho will do, or it lies about the row.
    expect(screen.getByText('€/ud')).toBeInTheDocument()
  })

  it('takes the weight rule as soon as the price is retyped', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={perUnitWithAWeight}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    const price = screen.getByLabelText('Precio')
    await userEvent.clear(price)
    await userEvent.type(price, '3')
    expect(screen.getByText('€/kg')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ pricePer: 'KILOGRAM', price: 3 }),
    )
  })
})
