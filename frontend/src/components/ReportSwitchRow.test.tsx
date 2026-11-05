import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'
import { reportRequestOutcome } from '../lib/connectivity'
import { ReportSwitchRow } from './ReportSwitchRow'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return { ...actual, getReportPref: vi.fn(), setReportPref: vi.fn() }
})

const getToken = vi.fn(async () => 'token')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: false,
    recordReceiptConsent: vi.fn(),
  })
})

afterEach(() => {
  // The connectivity store is module-level state; leave it online.
  act(() => reportRequestOutcome(true))
})

const theSwitch = () => screen.getByRole('switch', { name: 'Informe mensual' })

test('the switch waits for the read, then shows the setting', async () => {
  vi.mocked(api.getReportPref).mockResolvedValue({ enabled: true })

  render(<ReportSwitchRow listId="l1" />)

  expect(theSwitch()).toBeDisabled()
  await waitFor(() => expect(theSwitch()).toBeEnabled())
  expect(theSwitch()).toHaveAttribute('aria-checked', 'true')
  expect(api.getReportPref).toHaveBeenCalledWith(getToken, 'l1')
})

test('turning it off writes the setting', async () => {
  vi.mocked(api.getReportPref).mockResolvedValue({ enabled: true })
  vi.mocked(api.setReportPref).mockResolvedValue(undefined)
  render(<ReportSwitchRow listId="l1" />)
  await waitFor(() => expect(theSwitch()).toBeEnabled())

  fireEvent.click(theSwitch())

  expect(theSwitch()).toHaveAttribute('aria-checked', 'false')
  await waitFor(() =>
    expect(api.setReportPref).toHaveBeenCalledWith(getToken, 'l1', false),
  )
})

test('turning it back on after an unsubscribe', async () => {
  vi.mocked(api.getReportPref).mockResolvedValue({ enabled: false })
  vi.mocked(api.setReportPref).mockResolvedValue(undefined)
  render(<ReportSwitchRow listId="l1" />)
  await waitFor(() => expect(theSwitch()).toBeEnabled())

  fireEvent.click(theSwitch())

  await waitFor(() =>
    expect(api.setReportPref).toHaveBeenCalledWith(getToken, 'l1', true),
  )
  expect(theSwitch()).toHaveAttribute('aria-checked', 'true')
})

test('a failed write puts the switch back and says so', async () => {
  vi.mocked(api.getReportPref).mockResolvedValue({ enabled: true })
  vi.mocked(api.setReportPref).mockRejectedValue(new api.ApiError(500, ''))
  const onListSuspect = vi.fn()
  render(<ReportSwitchRow listId="l1" onListSuspect={onListSuspect} />)
  await waitFor(() => expect(theSwitch()).toBeEnabled())

  fireEvent.click(theSwitch())

  expect(
    await screen.findByText('No se pudo guardar el informe mensual'),
  ).toBeInTheDocument()
  expect(theSwitch()).toHaveAttribute('aria-checked', 'true')
  // A server error is not a sign the list is gone.
  expect(onListSuspect).not.toHaveBeenCalled()
})

test('a 404 on the write reports the list as suspect', async () => {
  vi.mocked(api.getReportPref).mockResolvedValue({ enabled: true })
  vi.mocked(api.setReportPref).mockRejectedValue(new api.ApiError(404, ''))
  const onListSuspect = vi.fn()
  render(<ReportSwitchRow listId="l1" onListSuspect={onListSuspect} />)
  await waitFor(() => expect(theSwitch()).toBeEnabled())

  fireEvent.click(theSwitch())

  await waitFor(() => expect(onListSuspect).toHaveBeenCalledTimes(1))
})

test('a 403 on the read reports the list as suspect and leaves the switch off', async () => {
  vi.mocked(api.getReportPref).mockRejectedValue(new api.ApiError(403, ''))
  const onListSuspect = vi.fn()

  render(<ReportSwitchRow listId="l1" onListSuspect={onListSuspect} />)

  await waitFor(() => expect(onListSuspect).toHaveBeenCalledTimes(1))
  expect(theSwitch()).toBeDisabled()
})

test('a failed read says so and leaves the switch off', async () => {
  vi.mocked(api.getReportPref).mockRejectedValue(new api.ApiError(500, ''))
  const onListSuspect = vi.fn()

  render(<ReportSwitchRow listId="l1" onListSuspect={onListSuspect} />)

  expect(
    await screen.findByText('No se pudo cargar el informe mensual'),
  ).toBeInTheDocument()
  expect(theSwitch()).toBeDisabled()
  expect(onListSuspect).not.toHaveBeenCalled()
})

test('a new callback each render does not read again', async () => {
  vi.mocked(api.getReportPref).mockResolvedValue({ enabled: true })
  const { rerender } = render(
    <ReportSwitchRow listId="l1" onListSuspect={() => {}} />,
  )
  await waitFor(() => expect(theSwitch()).toBeEnabled())

  rerender(<ReportSwitchRow listId="l1" onListSuspect={() => {}} />)

  expect(api.getReportPref).toHaveBeenCalledTimes(1)
})

test('offline, the tap is refused before any write', async () => {
  vi.mocked(api.getReportPref).mockResolvedValue({ enabled: true })
  render(<ReportSwitchRow listId="l1" />)
  await waitFor(() => expect(theSwitch()).toBeEnabled())
  act(() => reportRequestOutcome(false))

  fireEvent.click(theSwitch())

  expect(
    await screen.findByText('No disponible sin conexión'),
  ).toBeInTheDocument()
  expect(api.setReportPref).not.toHaveBeenCalled()
  expect(theSwitch()).toHaveAttribute('aria-checked', 'true')
})
