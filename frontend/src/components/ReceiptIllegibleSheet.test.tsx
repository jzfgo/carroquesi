import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { manualPurchase } from '../lib/api'
import { ReceiptIllegibleSheet } from './ReceiptIllegibleSheet'

vi.mock('../lib/api', () => ({
  manualPurchase: vi.fn(() => Promise.resolve({})),
}))

const getToken = () => Promise.resolve('t')

beforeEach(() => {
  vi.mocked(manualPurchase).mockResolvedValue({} as never)
})

function renderSheet(
  props: Partial<React.ComponentProps<typeof ReceiptIllegibleSheet>> = {},
) {
  const onDone = vi.fn()
  const onClose = vi.fn()
  const onDiscard = vi.fn()
  const onRetakePhoto = vi.fn()
  render(
    <ReceiptIllegibleSheet
      listId="l1"
      getToken={getToken}
      rescuedStore="Carrefour"
      rescuedDate="2026-07-26"
      rescuedTotal={41.6}
      storeOptions={['Mercadona', 'Lidl']}
      displayStore={(s) => s}
      onClose={onClose}
      onDone={onDone}
      onDiscard={onDiscard}
      onRetakePhoto={onRetakePhoto}
      showToast={vi.fn()}
      {...props}
    />,
  )
  return { onDone, onClose, onDiscard, onRetakePhoto }
}

test('seeds the rescued store, date and total, all editable', () => {
  renderSheet()
  // Store and total ride in from the parse; the total is shown comma-decimal.
  expect(screen.getByRole('button', { name: /Carrefour/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /41,60/ })).toBeInTheDocument()
  // The date reduces to a calendar-day label (built from parts, so no shift).
  expect(screen.getByRole('button', { name: /jul/ })).toBeInTheDocument()
})

test('offers the three actions and the three failure-time tips', () => {
  renderSheet()
  expect(screen.getByText('Repetir la foto')).toBeInTheDocument()
  expect(
    screen.getByText('Guardar solo la tienda y el total'),
  ).toBeInTheDocument()
  expect(screen.getByText('Descartar')).toBeInTheDocument()

  expect(
    screen.getByText('Sobre una superficie lisa y con luz de frente'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Que quepa entero, del encabezado al total'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Evita reflejos y sombras sobre el papel'),
  ).toBeInTheDocument()
})

test('«Guardar solo la tienda y el total» posts {date, store, total} with edits', async () => {
  const { onDone } = renderSheet()

  // Edit the total: tap the pill, change the revealed input.
  fireEvent.click(screen.getByRole('button', { name: /41,60/ }))
  fireEvent.change(screen.getByPlaceholderText('0,00'), {
    target: { value: '9,99' },
  })

  // Edit the store: tap the pill, retype.
  fireEvent.click(screen.getByRole('button', { name: /Carrefour/ }))
  fireEvent.change(screen.getByPlaceholderText('Nombre de la tienda'), {
    target: { value: 'Lidl' },
  })

  fireEvent.click(screen.getByText('Guardar solo la tienda y el total'))

  await waitFor(() => expect(manualPurchase).toHaveBeenCalled())
  const body = vi.mocked(manualPurchase).mock.calls.at(-1)![2]
  expect(body.store).toBe('Lidl')
  expect(body.total).toBe(9.99)
  expect(body.date).toBe('2026-07-26')
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})

test('a null rescue posts a null store and null total, dated today', async () => {
  const { onDone } = renderSheet({
    rescuedStore: null,
    rescuedDate: null,
    rescuedTotal: null,
  })
  fireEvent.click(screen.getByText('Guardar solo la tienda y el total'))

  await waitFor(() => expect(manualPurchase).toHaveBeenCalled())
  const body = vi.mocked(manualPurchase).mock.calls.at(-1)![2]
  expect(body.store).toBeNull()
  expect(body.total).toBeNull()
  expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})

test('«Descartar» exits without saving; «Repetir la foto» reopens the picker', () => {
  const { onDiscard, onRetakePhoto } = renderSheet()

  fireEvent.click(screen.getByText('Descartar'))
  expect(onDiscard).toHaveBeenCalled()

  fireEvent.click(screen.getByText('Repetir la foto'))
  expect(onRetakePhoto).toHaveBeenCalled()

  expect(manualPurchase).not.toHaveBeenCalled()
})
