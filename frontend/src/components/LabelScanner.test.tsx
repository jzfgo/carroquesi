import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LabelScanner } from './LabelScanner'

vi.mock('@undecaf/barcode-detector-polyfill', () => ({
  BarcodeDetectorPolyfill: class {
    detect() {
      return Promise.resolve([])
    }
  },
}))

let stopTrack = vi.fn()
let formatsSeen: string[] = []

function detectorReading(rawValue: string | null) {
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      constructor(options: { formats: string[] }) {
        formatsSeen = options.formats
      }
      detect = vi.fn(async () => (rawValue == null ? [] : [{ rawValue }]))
    },
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined)
  stopTrack = vi.fn()
  const stream = { getTracks: () => [{ stop: stopTrack }] }
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(async () => stream) },
    configurable: true,
  })
  let ran = false
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    if (!ran) {
      ran = true
      cb(0)
    }
    return 0
  })
  detectorReading(null)
})

describe('LabelScanner', () => {
  it('reads the barcodes a weighed label carries', async () => {
    render(
      <LabelScanner
        lineName="Pechuga de pollo"
        lineTotal={5.72}
        onDetect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(formatsSeen).toEqual(['code_128', 'qr_code']))
  })

  it('names the line it scans for', () => {
    render(
      <LabelScanner
        lineName="Pechuga de pollo"
        lineTotal={5.72}
        onDetect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Etiqueta para')).toBeInTheDocument()
    expect(screen.getByText('Pechuga de pollo')).toBeInTheDocument()
    expect(screen.getByText('5,72')).toBeInTheDocument()
    expect(
      screen.getByText('Apunta al código de barras de la etiqueta'),
    ).toBeInTheDocument()
  })

  it('leaves the total out when the line has none yet', () => {
    render(
      <LabelScanner
        lineName="Contramuslo"
        lineTotal={null}
        onDetect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Contramuslo')).toBeInTheDocument()
    expect(screen.queryByText(/\d,\d\d/)).not.toBeInTheDocument()
  })

  it('hands over the first read once and stops the camera', async () => {
    detectorReading('230035050320600155004972')
    const onDetect = vi.fn()
    render(
      <LabelScanner
        lineName="Sandía"
        lineTotal={4.97}
        onDetect={onDetect}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(onDetect).toHaveBeenCalledWith('230035050320600155004972'),
    )
    expect(onDetect).toHaveBeenCalledTimes(1)
    expect(stopTrack).toHaveBeenCalled()
  })

  it('hands over null for a read that cannot be a label', async () => {
    detectorReading('https://example.com/promo')
    const onDetect = vi.fn()
    render(
      <LabelScanner
        lineName="Sandía"
        lineTotal={4.97}
        onDetect={onDetect}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(onDetect).toHaveBeenCalledWith(null))
  })

  it('renders on the page, outside a sliding sheet panel', () => {
    render(
      <div data-testid="panel" style={{ transform: 'translateY(0)' }}>
        <LabelScanner
          lineName="Sandía"
          lineTotal={4.97}
          onDetect={vi.fn()}
          onClose={vi.fn()}
        />
      </div>,
    )
    const close = screen.getByRole('button', { name: 'Cerrar escáner' })
    expect(screen.getByTestId('panel')).not.toContainElement(close)
    expect(close.closest('.barcode-scanner')?.parentElement).toBe(document.body)
  })
})
