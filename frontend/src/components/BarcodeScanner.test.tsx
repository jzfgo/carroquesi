import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { BarcodeScanner } from './BarcodeScanner'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'

vi.mock('@undecaf/barcode-detector-polyfill', () => ({
  BarcodeDetectorPolyfill: class {
    detect() { return Promise.resolve([]) }
  },
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, getBarcode: vi.fn() }
})

const mockGetToken = () => Promise.resolve('token')

beforeEach(() => {
  vi.unstubAllGlobals()

  // Mock camera stream
  const mockTrack = { stop: vi.fn() }
  const mockStream = { getTracks: () => [mockTrack] }
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    configurable: true,
  })

  // Default: detector finds nothing (will be overridden per-test)
  vi.stubGlobal('BarcodeDetector', class {
    detect = vi.fn().mockResolvedValue([])
  })

  // Run requestAnimationFrame synchronously (single frame, then stop)
  let rafCalled = false
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (!rafCalled) { rafCalled = true; cb(0) }
    return 0
  })
})

describe('BarcodeScanner', () => {
  it('renders a close button', () => {
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onError={vi.fn()} onClose={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument()
  })

  it('calls onClose when close button is tapped', async () => {
    const onClose = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onError={vi.fn()} onClose={onClose} />
    )
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onResult with product when barcode found', async () => {
    vi.stubGlobal('BarcodeDetector', class {
      detect = vi.fn().mockResolvedValue([{ rawValue: '8411327122016' }])
    })
    const product = { name: 'Leche', brand: 'Pascual', stores: [] }
    ;(api.getBarcode as Mock).mockResolvedValue(product)

    const onResult = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={onResult} onError={vi.fn()} onClose={vi.fn()} />
    )
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(product))
  })

  it('calls onError with "Producto no encontrado" when backend returns 404', async () => {
    vi.stubGlobal('BarcodeDetector', class {
      detect = vi.fn().mockResolvedValue([{ rawValue: '8411327122016' }])
    })
    ;(api.getBarcode as Mock).mockRejectedValue(new ApiError(404, 'not found'))

    const onError = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onError={onError} onClose={vi.fn()} />
    )
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Producto no encontrado'))
  })

  it('calls onError with service unavailable message when backend returns 503', async () => {
    vi.stubGlobal('BarcodeDetector', class {
      detect = vi.fn().mockResolvedValue([{ rawValue: '8411327122016' }])
    })
    ;(api.getBarcode as Mock).mockRejectedValue(new ApiError(503, 'unavailable'))

    const onError = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onError={onError} onClose={vi.fn()} />
    )
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Servicio no disponible, inténtalo más tarde'))
  })

  it('calls onError with generic message for unexpected errors', async () => {
    vi.stubGlobal('BarcodeDetector', class {
      detect = vi.fn().mockResolvedValue([{ rawValue: '8411327122016' }])
    })
    ;(api.getBarcode as Mock).mockRejectedValue(new Error('network failure'))

    const onError = vi.fn()
    render(
      <BarcodeScanner getToken={mockGetToken} onResult={vi.fn()} onError={onError} onClose={vi.fn()} />
    )
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Error al buscar el producto'))
  })
})
