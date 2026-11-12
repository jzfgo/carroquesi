import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLabel } from '../lib/api'
import { reportRequestOutcome } from '../lib/connectivity'
import type { LabelRead } from '../types'
import { LabelScanFlow } from './LabelScanFlow'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getLabel: vi.fn(),
}))

// The camera itself is LabelScanner's to test. Here a read is a button.
vi.mock('./LabelScanner', () => ({
  LabelScanner: ({
    onDetect,
    onClose,
  }: {
    onDetect: (code: string | null) => void
    onClose: () => void
  }) => (
    <div>
      <button onClick={() => onDetect('230000000000000000000000')}>
        leer etiqueta
      </button>
      <button onClick={() => onDetect(null)}>leer otra cosa</button>
      <button onClick={onClose}>Cerrar escáner</button>
    </div>
  ),
}))

const CODE = '230000000000000000000000'

// The frames' «Pechuga de pollo»: 636 g at 9,00 €/kg is 5,72.
const POLLO: LabelRead = {
  format: 'mercadona-24',
  article: '01234',
  reduced: false,
  weight_g: 636,
  price_per_kg_cents: 900,
  total_cents: 572,
  chain: 'Mercadona',
}

function setup(overrides: Partial<Parameters<typeof LabelScanFlow>[0]> = {}) {
  const props = {
    getToken: () => Promise.resolve('t'),
    store: 'Mercadona',
    lineName: 'Pechuga de pollo',
    lineTotal: 5.72 as number | null,
    usedOn: vi.fn((): string | null => null),
    showToast: vi.fn(),
    onUse: vi.fn(),
    onManual: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  render(<LabelScanFlow {...props} />)
  return props
}

async function read() {
  await userEvent.click(screen.getByRole('button', { name: 'leer etiqueta' }))
}

afterEach(() => {
  reportRequestOutcome(true)
})

describe('LabelScanFlow', () => {
  it('opens on the camera', () => {
    setup()
    expect(
      screen.getByRole('button', { name: 'leer etiqueta' }),
    ).toBeInTheDocument()
  })

  it('a closed camera cancels', async () => {
    const props = setup()
    await userEvent.click(
      screen.getByRole('button', { name: 'Cerrar escáner' }),
    )
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('decodes with the store as the hint', async () => {
    vi.mocked(getLabel).mockResolvedValue(POLLO)
    setup({ store: 'Mercadona Centro' })
    await read()
    expect(getLabel).toHaveBeenCalledWith(
      expect.any(Function),
      CODE,
      'Mercadona Centro',
    )
  })

  it('a label that matches the line', async () => {
    vi.mocked(getLabel).mockResolvedValue(POLLO)
    const props = setup()
    await read()
    expect(await screen.findByText('Etiqueta leída')).toBeInTheDocument()
    expect(screen.getByText('0,636')).toBeInTheDocument()
    expect(screen.getByText('9,00 €')).toBeInTheDocument()
    expect(screen.getByText('Cuadra con el ticket')).toBeInTheDocument()
    expect(
      screen.getByText(
        'La línea guarda el peso y el precio por kilo. El importe sigue siendo el del ticket.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Usar en esta línea' }),
    )
    expect(props.onUse).toHaveBeenCalledWith({ code: CODE, label: POLLO })
  })

  it('a label whose total differs is the user to judge', async () => {
    vi.mocked(getLabel).mockResolvedValue({
      ...POLLO,
      weight_g: 702,
      total_cents: 632,
    })
    const props = setup()
    await read()
    expect(await screen.findByText('Revisa la etiqueta')).toBeInTheDocument()
    expect(
      screen.getAllByText(
        (_, el) =>
          el?.textContent ===
          'La etiqueta dice 6,32\u00a0€ y esta línea 5,72\u00a0€. Puede que sea otro artículo.',
      ).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'Usarla guarda el peso y el €/kg. El importe sigue siendo el del ticket.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Usarla de todas formas' }),
    )
    expect(props.onUse).toHaveBeenCalled()
  })

  it('«Volver a escanear» opens the camera again', async () => {
    vi.mocked(getLabel).mockResolvedValue({ ...POLLO, total_cents: 632 })
    setup()
    await read()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Volver a escanear' }),
    )
    expect(
      screen.getByRole('button', { name: 'leer etiqueta' }),
    ).toBeInTheDocument()
  })

  it('a label already on another line warns, but does not block', async () => {
    vi.mocked(getLabel).mockResolvedValue(POLLO)
    const props = setup({ usedOn: vi.fn(() => 'Pechuga de pollo') })
    await read()
    expect(await screen.findByText('Revisa la etiqueta')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Esta etiqueta ya está en otra línea de Pechuga de pollo. Puede ser la misma etiqueta dos veces, o dos artículos que pesan y cuestan lo mismo.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/La etiqueta dice/)).not.toBeInTheDocument()
    expect(props.usedOn).toHaveBeenCalledWith(CODE)
    await userEvent.click(
      screen.getByRole('button', { name: 'Usarla de todas formas' }),
    )
    expect(props.onUse).toHaveBeenCalled()
  })

  it('both reasons at once say both', async () => {
    vi.mocked(getLabel).mockResolvedValue({ ...POLLO, total_cents: 632 })
    setup({ usedOn: vi.fn(() => 'Pechuga de pollo') })
    await read()
    expect(await screen.findByText(/La etiqueta dice/)).toBeInTheDocument()
    expect(screen.getByText(/Esta etiqueta ya está/)).toBeInTheDocument()
  })

  it('without a receipt the label sets the amount', async () => {
    vi.mocked(getLabel).mockResolvedValue(POLLO)
    const props = setup({ lineTotal: null, lineName: 'Contramuslo' })
    await read()
    expect(await screen.findByText('Etiqueta leída')).toBeInTheDocument()
    expect(screen.getByText('5,72 €')).toBeInTheDocument()
    expect(screen.queryByText('Cuadra con el ticket')).not.toBeInTheDocument()
    expect(screen.queryByText(/línea del ticket/)).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Usar en esta línea' }),
    )
    expect(props.onUse).toHaveBeenCalled()
  })

  it('a refused label is the one failure state', async () => {
    vi.mocked(getLabel).mockResolvedValue(null)
    const props = setup()
    await read()
    expect(
      await screen.findByText('No reconozco esta etiqueta'),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Escribir a mano' }),
    )
    expect(props.onManual).toHaveBeenCalled()
  })

  it('«Reintentar» opens the camera again', async () => {
    vi.mocked(getLabel).mockResolvedValue(null)
    setup()
    await read()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reintentar' }),
    )
    expect(
      screen.getByRole('button', { name: 'leer etiqueta' }),
    ).toBeInTheDocument()
  })

  it('a read that cannot be a label fails without asking', async () => {
    setup()
    await userEvent.click(
      screen.getByRole('button', { name: 'leer otra cosa' }),
    )
    expect(screen.getByText('No reconozco esta etiqueta')).toBeInTheDocument()
    expect(getLabel).not.toHaveBeenCalled()
  })

  it('a label that gives no weight fails too', async () => {
    vi.mocked(getLabel).mockResolvedValue({
      ...POLLO,
      format: 'ean13-price',
      weight_g: null,
      price_per_kg_cents: null,
    })
    setup()
    await read()
    expect(
      await screen.findByText('No reconozco esta etiqueta'),
    ).toBeInTheDocument()
  })

  it('offline, it refuses before asking', async () => {
    const props = setup()
    reportRequestOutcome(false)
    await read()
    expect(props.showToast).toHaveBeenCalledWith('Sin conexión')
    expect(props.onCancel).toHaveBeenCalled()
    expect(getLabel).not.toHaveBeenCalled()
  })

  it('a request that never reaches the server is offline, not a refusal', async () => {
    vi.mocked(getLabel).mockRejectedValue(new TypeError('Failed to fetch'))
    const props = setup()
    await read()
    await waitFor(() =>
      expect(props.showToast).toHaveBeenCalledWith('Sin conexión'),
    )
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('any other failure is the failure state', async () => {
    vi.mocked(getLabel).mockRejectedValue(new Error('500'))
    setup()
    await read()
    expect(
      await screen.findByText('No reconozco esta etiqueta'),
    ).toBeInTheDocument()
  })
})
