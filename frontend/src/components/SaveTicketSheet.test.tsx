import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { manualPurchase } from '../lib/api'
import { SaveTicketSheet } from './SaveTicketSheet'

vi.mock('../lib/api', () => ({
  manualPurchase: vi.fn(() => Promise.resolve({})),
}))

const getToken = () => Promise.resolve('t')

beforeEach(() => {
  vi.mocked(manualPurchase).mockResolvedValue({} as never)
})

function renderSheet(
  props: Partial<React.ComponentProps<typeof SaveTicketSheet>> = {},
) {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(
    <SaveTicketSheet
      listId="l1"
      getToken={getToken}
      storeOptions={['Mercadona', 'Lidl']}
      displayStore={(s) => s}
      onClose={onClose}
      onDone={onDone}
      showToast={vi.fn()}
      {...props}
    />,
  )
  return { onDone, onClose }
}

test('the manual submit posts {date, store, total}', async () => {
  const { onDone } = renderSheet()
  fireEvent.click(screen.getByText('Mercadona'))
  fireEvent.change(screen.getByPlaceholderText('0,00'), {
    target: { value: '12,40' },
  })
  fireEvent.click(screen.getByText('Guardar compra'))

  await waitFor(() => expect(manualPurchase).toHaveBeenCalled())
  const body = vi.mocked(manualPurchase).mock.calls.at(-1)![2]
  expect(body.store).toBe('Mercadona')
  expect(body.total).toBe(12.4)
  expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await waitFor(() => expect(onDone).toHaveBeenCalled())
})

test('the date defaults to today and blocks the future', () => {
  renderSheet()
  const input = screen.getByLabelText<HTMLInputElement>('Fecha')
  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  expect(input.value).toBe(iso)
  // The control cannot be pushed past today.
  expect(input.max).toBe(iso)
})

test('a bare record posts a null store and null total', async () => {
  renderSheet({ storeOptions: [] })
  fireEvent.click(screen.getByText('Guardar compra'))
  await waitFor(() => expect(manualPurchase).toHaveBeenCalled())
  const body = vi.mocked(manualPurchase).mock.calls.at(-1)![2]
  expect(body.store).toBeNull()
  expect(body.total).toBeNull()
})

test('«+ otra» swaps content in place — not a second sheet', () => {
  renderSheet()
  fireEvent.click(screen.getByText('+ otra'))
  // The «Nueva tienda» step replaces the form content; there is still one dialog.
  expect(screen.getByPlaceholderText('Nombre de la tienda')).toBeInTheDocument()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  // Confirming the typed store returns to the form and selects it.
  fireEvent.change(screen.getByPlaceholderText('Nombre de la tienda'), {
    target: { value: 'Ahorramás' },
  })
  fireEvent.click(screen.getByText('Usar esta tienda'))
  const chip = screen.getByText('Ahorramás')
  expect(chip.className).toContain('save-chip--on')
})

test('the scan action shows only when onScanReceipt is wired, and calls it', () => {
  const onScanReceipt = vi.fn()
  renderSheet({ onScanReceipt })
  const scan = screen.getByText('Escanear el ticket')
  fireEvent.click(scan)
  expect(onScanReceipt).toHaveBeenCalled()
})

test('the scan action is absent when the flag is off (no onScanReceipt)', () => {
  renderSheet()
  expect(screen.queryByText('Escanear el ticket')).not.toBeInTheDocument()
})
