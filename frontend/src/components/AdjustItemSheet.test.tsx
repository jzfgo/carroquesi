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

  it('does not re-unit when the same amount is typed a different way', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={perUnitWithAWeight}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    // 2,50 and 2.5 are the same price. Comparing the strings would read this
    // as a repricing and flip the row to per kilo.
    const price = screen.getByLabelText('Precio')
    await userEvent.clear(price)
    await userEvent.type(price, '2,50')
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ price: 2.5, pricePer: null }),
    )
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

describe('AdjustItemSheet and a quantity corrected on its own', () => {
  const perUnitWithAWeight = {
    ...base,
    quantity: '500 g',
    price: 2.5,
    pricePer: null,
  }

  it('does not re-unit a row whose quantity was corrected but not its price', async () => {
    const onDone = vi.fn()
    render(
      <AdjustItemSheet
        line={perUnitWithAWeight}
        onDone={onDone}
        onClose={vi.fn()}
      />,
    )

    const qty = screen.getByLabelText('Cantidad')
    await userEvent.clear(qty)
    await userEvent.type(qty, '600 g')
    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    // The pack was bigger than it said. That restates how much came home,
    // not what a unit cost — so the price stays per item and keeps its value.
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: '600 g',
        price: 2.5,
        pricePer: null,
      }),
    )
  })
})

// A row the paper printed shows the paper's amount, and both the button's
// figure and the reconciliation check add that up rather than the price. A
// price typed over it would travel to price history while every figure on
// screen went on quoting the paper, so the field does not take one.
describe('AdjustItemSheet and a row the paper printed', () => {
  const printed = {
    ...base,
    price: 2.5,
    receiptAmount: 2.8,
  }

  it('does not take a price over the paper', async () => {
    render(
      <AdjustItemSheet line={printed} onDone={vi.fn()} onClose={vi.fn()} />,
    )

    const price = screen.getByLabelText('Precio')
    expect(price).toHaveAttribute('readonly')

    await userEvent.type(price, '9')

    expect(price).toHaveValue('2.5')
  })

  it('says where the amount comes from and how to take it back', () => {
    render(
      <AdjustItemSheet line={printed} onDone={vi.fn()} onClose={vi.fn()} />,
    )

    expect(screen.getByText(/El importe lo pone el ticket/)).toBeInTheDocument()
  })

  it('hands the printed row back with the paper untouched', async () => {
    const onDone = vi.fn()
    render(<AdjustItemSheet line={printed} onDone={onDone} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Hecho' }))

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ price: 2.5, receiptAmount: 2.8 }),
    )
  })

  // The guard is the printed amount, not the row being settled — a hand-written
  // close has neither, and its price has to stay typeable.
  it('still takes a price on a row with no paper behind it', async () => {
    render(<AdjustItemSheet line={base} onDone={vi.fn()} onClose={vi.fn()} />)

    const price = screen.getByLabelText('Precio')
    expect(price).not.toHaveAttribute('readonly')

    await userEvent.type(price, '2.49')

    expect(price).toHaveValue('2.49')
  })
})
