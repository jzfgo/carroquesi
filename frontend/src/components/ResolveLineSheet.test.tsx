import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CloseLine } from '../lib/closeLines'
import { ResolveLineSheet } from './ResolveLineSheet'

const line: CloseLine = {
  key: 'receipt-0',
  itemId: null,
  name: '',
  brand: null,
  quantity: '2',
  price: 1.59,
  pricePer: null,
  included: false,
  fromCart: false,
  receiptLine: 'CHOCO NGR 70% 100G',
  receiptAmount: 3.18,
}

const candidates: CloseLine[] = [
  {
    key: 'i1',
    itemId: 'i1',
    name: 'Chocolate negro',
    brand: null,
    quantity: '1',
    price: null,
    pricePer: null,
    included: true,
    fromCart: true,
  },
  {
    key: 'i2',
    itemId: 'i2',
    name: 'Leche entera',
    brand: null,
    quantity: '6',
    price: null,
    pricePer: null,
    included: false,
    fromCart: false,
  },
]

function open(props: Partial<Parameters<typeof ResolveLineSheet>[0]> = {}) {
  const onResolve = vi.fn()
  const onClose = vi.fn()
  render(
    <ResolveLineSheet
      line={line}
      candidates={candidates}
      onResolve={onResolve}
      onClose={onClose}
      {...props}
    />,
  )
  return { onResolve, onClose }
}

const asignar = () => screen.getByRole('button', { name: 'Asignar' })
const field = () => screen.getByLabelText('Si no estaba en la lista')

describe('ResolveLineSheet', () => {
  // The guardrail: the person is reading this off the paper in their hand, so
  // the string the till printed has to be on screen unedited.
  it('shows the line as the paper printed it', () => {
    open()

    expect(screen.getByText('CHOCO NGR 70% 100G')).toBeInTheDocument()
    // The amount the paper printed, never the price times the quantity. The
    // currency is formatted for whatever locale the runner has, so only the
    // figures are asserted.
    expect(screen.getByText(/2 · .*3[.,]18/)).toBeInTheDocument()
  })

  it('hands back the row that was picked', async () => {
    const { onResolve } = open()

    await userEvent.click(
      screen.getByRole('radio', { name: /Chocolate negro/ }),
    )
    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'receipt-0',
        itemId: 'i1',
        name: 'Chocolate negro',
        included: true,
        receiptLine: 'CHOCO NGR 70% 100G',
        receiptAmount: 3.18,
        price: 1.59,
        quantity: '2',
      }),
    )
  })

  it('says which rows are still waiting to be claimed', () => {
    open()

    expect(screen.getByText('Pendientes de asignar · 2')).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /en el carro/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /sigue en la lista/ }),
    ).toBeInTheDocument()
  })

  it('hands back a product that was never on the list', async () => {
    const { onResolve } = open()

    await userEvent.clear(field())
    await userEvent.type(field(), 'Chocolate 70%')
    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'receipt-0',
        itemId: null,
        name: 'Chocolate 70%',
        brand: null,
        included: true,
      }),
    )
  })

  it('reads a brand sigil and previews what it will create', async () => {
    const { onResolve } = open()

    await userEvent.clear(field())
    await userEvent.type(field(), 'Chocolate 70% #Valor')

    const preview = screen.getByTestId('parse-preview')
    expect(preview).toHaveTextContent('Chocolate 70%')
    expect(preview).toHaveTextContent('Valor')

    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chocolate 70%', brand: 'Valor' }),
    )
  })

  // A preview of plain text is the same text twice, which is a label for the
  // field rather than a preview of anything.
  it('previews nothing when the parser recognised nothing', async () => {
    open()

    expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()

    await userEvent.clear(field())
    await userEvent.type(field(), 'Chocolate negro')

    expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()
  })

  it('stays inert until there is an answer', async () => {
    const { onResolve } = open()

    expect(asignar()).toBeDisabled()
    await userEvent.click(asignar())

    expect(onResolve).not.toHaveBeenCalled()
  })

  // A brand on its own names nothing. The parse is recognised, so the preview
  // shows, but there is no product to create.
  it('stays inert on a brand with no product name', async () => {
    const { onResolve } = open()

    await userEvent.clear(field())
    await userEvent.type(field(), '#Valor')

    expect(screen.getByTestId('parse-preview')).toBeInTheDocument()
    expect(asignar()).toBeDisabled()
    await userEvent.click(asignar())

    expect(onResolve).not.toHaveBeenCalled()
  })

  it('drops what was typed when a row is picked afterwards', async () => {
    const { onResolve } = open()

    await userEvent.clear(field())
    await userEvent.type(field(), 'Chocolate 70% #Valor')
    await userEvent.click(
      screen.getByRole('radio', { name: /Chocolate negro/ }),
    )

    // Nothing may look as though both answers are live.
    expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()

    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'i1', name: 'Chocolate negro' }),
    )
  })

  it('drops the picked row when something is typed afterwards', async () => {
    const { onResolve } = open()

    const radio = screen.getByRole('radio', { name: /Chocolate negro/ })
    await userEvent.click(radio)
    expect(radio).toBeChecked()

    await userEvent.clear(field())
    await userEvent.type(field(), 'Chocolate 70%')

    expect(radio).not.toBeChecked()

    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: null, name: 'Chocolate 70%' }),
    )
  })

  // The chevron is the way out, and the row's checkbox on the close sheet is
  // where a line is dropped. A second control for either would be a second
  // path to one decision.
  it('offers one action, one way out, and nothing else', () => {
    open()

    expect(
      screen.queryByRole('button', { name: /cancelar/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    // The way out and Asignar. Anything else here is a second path.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('leaves by the chevron without answering', async () => {
    const { onResolve, onClose } = open()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalled()
    expect(onResolve).not.toHaveBeenCalled()
  })
})

/** A line the matcher placed by score: it names an item already, and nobody has
 *  said yet whether that is right. */
const guess: CloseLine = {
  key: 'i9',
  itemId: 'i9',
  name: 'Chocolate Valor',
  brand: null,
  quantity: '2',
  price: 1.59,
  pricePer: null,
  included: true,
  fromCart: true,
  receiptLine: 'CHOCO NGR 70% 100G',
  receiptAmount: 3.18,
  matchState: 'guess',
}

describe('ResolveLineSheet on a line the matcher guessed', () => {
  it('offers the item the row already names, ready to be confirmed', () => {
    open({ line: guess })

    expect(screen.getByRole('radio', { name: /Chocolate Valor/ })).toBeChecked()
    // The item is claimed by this very row, so it is not one of the rows still
    // waiting and the count may not say it is.
    expect(screen.getByText('Pendientes de asignar · 2')).toBeInTheDocument()
  })

  it('confirms the guess in one tap and hands the row back solid', async () => {
    const { onResolve } = open({ line: guess })

    expect(asignar()).toBeEnabled()
    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'i9',
        itemId: 'i9',
        name: 'Chocolate Valor',
        matchState: 'literal',
        receiptLine: 'CHOCO NGR 70% 100G',
        receiptAmount: 3.18,
        price: 1.59,
        quantity: '2',
      }),
    )
  })

  it('corrects a wrong guess to a row that was still waiting', async () => {
    const { onResolve } = open({ line: guess })

    await userEvent.click(screen.getByRole('radio', { name: /Leche entera/ }))
    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'i2',
        name: 'Leche entera',
        matchState: 'literal',
      }),
    )
  })

  it('corrects a wrong guess to a product that was never on the list', async () => {
    const { onResolve } = open({ line: guess })

    await userEvent.clear(field())
    await userEvent.type(field(), 'Chocolate 70%')
    await userEvent.click(asignar())

    expect(
      screen.getByRole('radio', { name: /Chocolate Valor/ }),
    ).not.toBeChecked()
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: null,
        name: 'Chocolate 70%',
        matchState: 'literal',
      }),
    )
  })
})

describe('ResolveLineSheet with nothing left to claim', () => {
  it('offers no rows and still creates', async () => {
    const { onResolve } = open({ candidates: [] })

    expect(screen.queryByText(/Pendientes de asignar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(asignar()).toBeDisabled()

    await userEvent.clear(field())
    await userEvent.type(field(), 'Chocolate 70%')
    await userEvent.click(asignar())

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: null, name: 'Chocolate 70%' }),
    )
  })
})
