import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { ApiError, getBarcode, getPriceHistory } from '../lib/api'
import type { ListItem, Member, PriceHistoryResponse } from '../types'
import { ItemFichaSheet } from './ItemFichaSheet'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    getPriceHistory: vi.fn(() => Promise.resolve({ entries: [] })),
    getBarcode: vi.fn(),
  }
})

// The camera reads whatever code the test hands it.
vi.mock('./CameraScanner', () => ({
  CameraScanner: ({ onDetect }: { onDetect: (raw: string) => void }) => (
    <button onClick={() => onDetect('8480000118325')}>Leer (mock)</button>
  ),
}))

const history: PriceHistoryResponse = {
  entries: [
    {
      amount: 0.89,
      is_sin_precio: false,
      reduced: false,
      price_before: null,
      pack: null,
      price_per: null,
      purchased_at: '2026-07-22T10:00:00Z',
      quantity: '6 ud',
      store: 'Mercadona',
    },
  ],
}

const item: ListItem = {
  id: 'i1',
  list_id: 'l1',
  name: 'Leche entera',
  quantity: '6 ud',
  purchased_quantity: null,
  brand: 'Puleva',
  stores: ['Mercadona'],
  purchased: false,
  purchased_at: null,
  purchase_has_receipt: false,
  bought_by_weight: false,
  ean: '8410188012374',
  price: 0.89,
  price_per: null,
  price_store: 'Mercadona',
  added_by: 'u1',
  created_at: '2026-07-18T09:00:00Z',
  updated_at: '2026-07-18T09:00:00Z',
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

function renderSheet(
  over: Partial<ListItem> = {},
  props: Record<string, unknown> = {},
) {
  const handlers = {
    onRename: vi.fn(),
    onSetTag: vi.fn(),
    onSetStores: vi.fn(),
    onSetPack: vi.fn(),
    onCorrect: vi.fn(async () => true),
    onToast: vi.fn(),
    onDelete: vi.fn(),
    onClone: vi.fn(),
    onClose: vi.fn(),
  }
  const getToken = vi.fn(() => Promise.resolve('t'))
  const sheet = (line: Partial<ListItem>) => (
    <ItemFichaSheet
      item={{ ...item, ...line }}
      members={members}
      displayStore={(raw) => raw}
      getToken={getToken}
      listId="l1"
      listItems={[]}
      purchased={line.purchased}
      {...handlers}
      {...props}
    />
  )
  const { rerender } = render(sheet(over))
  // What the parent does once a write lands: the sheet gets the new line.
  const update = (next: Partial<ListItem>) =>
    rerender(sheet({ ...over, ...next }))
  return { ...handlers, update }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPriceHistory).mockResolvedValue({ entries: [] })
})

test('renders the four blocks: último precio, price history, producto fields, and rastro', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce(history)
  renderSheet()

  // Block 1 + the header (the dialog is named for the product).
  expect(screen.getByText('Último precio')).toBeInTheDocument()
  expect(
    screen.getByRole('dialog', { name: 'Leche entera' }),
  ).toBeInTheDocument()

  // Block 2 arrives after the history fetch resolves.
  await waitFor(() => expect(screen.getByText(/1 precio/)).toBeInTheDocument())

  // Block 3 — every product field label.
  expect(screen.getByText('Producto')).toBeInTheDocument()
  for (const label of ['Nombre', 'Marca', 'Cantidad', 'Tiendas', 'Código']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  expect(screen.getByText('8410188012374')).toBeInTheDocument()

  // Block 4. The adder's name comes back emphasised, so it sits in its own
  // node — assert the surrounding text and the bold name separately.
  expect(screen.getByText('Rastro')).toBeInTheDocument()
  expect(screen.getByText(/Lo añadió/)).toBeInTheDocument()
  expect(screen.getByText('Marta').tagName).toBe('B')
})

test('a reduced last price with a known old price shows it and the saving', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce({
    entries: [
      {
        amount: 8.82,
        is_sin_precio: false,
        reduced: true,
        price_before: 12.6,
        pack: null,
        price_per: 'KILOGRAM',
        purchased_at: '2026-11-10T10:00:00Z',
        quantity: '0,346 kg',
        store: 'Mercadona',
      },
    ],
  })
  renderSheet()
  expect(
    await screen.findByText(
      (_, el) =>
        el?.className === 'ficha__before' &&
        /^Antes 12,60\s€\/kg · 30\s% menos$/.test(el.textContent ?? ''),
    ),
  ).toBeInTheDocument()
})

test('a reduced price without an old price reads like any other', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce({
    entries: [{ ...history.entries[0], reduced: true }],
  })
  renderSheet()
  await waitFor(() => expect(screen.getByText(/1 precio/)).toBeInTheDocument())
  expect(screen.queryByText(/Antes/)).not.toBeInTheDocument()
})

test('an empty field says so in words, not with a dash', () => {
  renderSheet({ brand: null, quantity: null, stores: [], ean: null })
  for (const empty of [
    'Sin marca',
    'Sin cantidad',
    'Sin formato',
    'Sin tiendas',
    'Sin código',
  ]) {
    expect(screen.getByText(empty)).toHaveClass('ficha__field-value--empty')
  }
  expect(screen.queryByText('—')).toBeNull()
})

test('the Nombre field opens the rename editor in place and steps back', () => {
  renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  expect(
    screen.getByRole('textbox', { name: 'Nombre del producto' }),
  ).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(
    screen.queryByRole('textbox', { name: 'Nombre del producto' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /nombre/i })).toBeInTheDocument()
})

test('renaming calls onRename with the trimmed value', () => {
  const { onRename } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Nombre del producto' }),
    {
      target: { value: '  Leche desnatada  ' },
    },
  )
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(onRename).toHaveBeenCalledWith('Leche desnatada')
})

test('Marca and Cantidad edit inside the sheet and step back on save', () => {
  const { onSetTag, onClose } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /marca/i }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Marca' }), {
    target: { value: 'Pascual' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(onSetTag).toHaveBeenCalledWith('brand', 'Pascual')

  fireEvent.click(screen.getByRole('button', { name: /cantidad/i }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad' }), {
    target: { value: '2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(onSetTag).toHaveBeenCalledWith('quantity', '2')
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText('Producto')).toBeInTheDocument()
})

test('Tiendas edits inside the sheet', () => {
  const { onSetStores } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /tiendas/i }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Nueva tienda' }), {
    target: { value: 'Lidl' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir tienda' }))
  expect(onSetStores).toHaveBeenCalledWith(['Mercadona', 'Lidl'])
})

test('a dismiss inside an editor goes back to the sheet, not the list', () => {
  const { onClose } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /marca/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText('Producto')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /tiendas/i }))
  fireEvent.click(document.querySelector('.modal-sheet-scrim')!)
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText('Producto')).toBeInTheDocument()
})

test('a purchased record can still correct its product fields', () => {
  renderSheet({ purchased: true })
  fireEvent.click(screen.getByRole('button', { name: /marca/i }))
  expect(screen.getByRole('textbox', { name: 'Marca' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  expect(
    screen.getByRole('textbox', { name: 'Nombre del producto' }),
  ).toBeInTheDocument()
})

const sibling = (name: string, brand: string | null, id: string) => ({
  ...item,
  id,
  name,
  brand,
})

test('renaming suggests the products the list already has', () => {
  const { onRename } = renderSheet(
    {},
    {
      listItems: [
        item,
        sibling('Leche entera', 'Puleva', 'i2'),
        sibling('LECHE semidesnatada', 'Pascual', 'i3'),
        sibling('Leche semidesnatada', 'Pascual', 'i4'),
        sibling('Pan', null, 'i5'),
      ],
    },
  )
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Nombre del producto' }),
    { target: { value: 'léche' } },
  )

  // One row per name + brand, never the line's own product.
  const suggestions = screen.getAllByRole('button', { name: /pascual/i })
  expect(suggestions).toHaveLength(1)
  expect(screen.queryByRole('button', { name: /puleva/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /^pan/i })).toBeNull()

  fireEvent.click(suggestions[0])
  expect(onRename).toHaveBeenCalledWith('LECHE semidesnatada', 'Pascual')
})

test('renaming a purchased record warns that its prices move', () => {
  renderSheet({ purchased: true })
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  expect(screen.getByText(/historial de precios/i)).toBeInTheDocument()
})

test('renaming a pending line says nothing about prices', () => {
  renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
  expect(screen.queryByText(/historial de precios/i)).toBeNull()
})

test('the footer clone action calls onClone on a purchased record', () => {
  const { onClone } = renderSheet({ purchased: true })
  fireEvent.click(screen.getByRole('button', { name: /volver a comprar/i }))
  expect(onClone).toHaveBeenCalled()
})

test('«Volver a comprar» is hidden on a pending item', () => {
  renderSheet({ purchased: false })
  expect(
    screen.queryByRole('button', { name: /volver a comprar/i }),
  ).not.toBeInTheDocument()
})

test('deleting confirms in a sub-state before calling onDelete', () => {
  const { onDelete } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
  expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
  expect(onDelete).toHaveBeenCalled()
})

const water = {
  amount: 3.48,
  is_sin_precio: false,
  reduced: false,
  price_before: null,
  pack: { count: 6, content: 1.5, unit: 'l' as const },
  price_per: null,
  purchased_at: '2026-11-10T10:00:00Z',
  quantity: '2',
  store: 'Mercadona',
}

test('with a format, «Último precio» is the shelf-label price', async () => {
  vi.mocked(getPriceHistory).mockResolvedValueOnce({ entries: [water] })
  renderSheet()
  expect(
    await screen.findByText(
      (_, el) =>
        el?.className === 'ficha__last-amount' &&
        /^0,39\s€\/L$/.test(el.textContent ?? ''),
    ),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/3,48\s€\/ud · 6 × 1,5 L · Mercadona/),
  ).toBeInTheDocument()
})

test('the Formato row shows the format and opens its editor', () => {
  renderSheet({ pack: { count: 6, content: 1.5, unit: 'l' } })
  const row = screen.getByRole('button', { name: /formato/i })
  expect(row).toHaveTextContent('6 × 1,5 L')
  fireEvent.click(row)
  expect(
    screen.getByRole('textbox', { name: 'Unidades por envase' }),
  ).toHaveValue('6')
  expect(
    screen.getByRole('textbox', { name: 'Peso de cada unidad' }),
  ).toHaveValue('1,5 L')
})

test('Hecho saves the typed format', () => {
  const { onSetPack } = renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /formato/i }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Unidades por envase' }),
    { target: { value: '12' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Hecho' }))
  expect(onSetPack).toHaveBeenCalledWith({
    count: 12,
    content: null,
    unit: null,
  })
})

test('a weight with no unit is refused and Hecho stays disabled', () => {
  renderSheet()
  fireEvent.click(screen.getByRole('button', { name: /formato/i }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Peso de cada unidad' }),
    { target: { value: '1,5' } },
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Añade la unidad')
  expect(screen.getByRole('button', { name: 'Hecho' })).toBeDisabled()
})

test('emptying both fields removes the format', () => {
  const { onSetPack } = renderSheet({
    pack: { count: 6, content: 1.5, unit: 'l' },
  })
  fireEvent.click(screen.getByRole('button', { name: /formato/i }))
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Unidades por envase' }),
    { target: { value: '' } },
  )
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Peso de cada unidad' }),
    { target: { value: '' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Hecho' }))
  expect(onSetPack).toHaveBeenCalledWith(null)
})

test('a closed purchase can still correct its format', () => {
  renderSheet({ purchased: true })
  expect(screen.getByRole('button', { name: /formato/i })).toBeInTheDocument()
})

test('a weighed line has no Formato row', () => {
  renderSheet({ price_per: 'KILOGRAM' })
  expect(screen.queryByText('Formato')).not.toBeInTheDocument()
})

test('a record with no price yet still offers «Registrar un precio»', async () => {
  const onSavePrice = vi.fn(async () => true)
  renderSheet({ purchased: true }, { onSavePrice })

  // The history fetch resolves empty; the entry row must not wait on it.
  fireEvent.click(
    await screen.findByRole('button', { name: /registrar un precio/i }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() =>
    expect(onSavePrice).toHaveBeenCalledWith(0.89, null, 'Mercadona', null),
  )
  expect(await screen.findByText('Producto')).toBeInTheDocument()
})

test('without a price entry and no history, the ficha shows no entry row', async () => {
  renderSheet()

  await waitFor(() => expect(getPriceHistory).toHaveBeenCalled())
  expect(
    screen.queryByRole('button', { name: /registrar un precio/i }),
  ).not.toBeInTheDocument()
})

// ── Código (JAV-257) ─────────────────────────────────────

const leche = {
  ean: '8480000118325',
  name: 'Leche semidesnatada',
  brand: 'Hacendado',
  stores: [],
  pack: { count: 6, content: 1, unit: 'l' as const },
}

const blank = { name: 'Leche semidesnatada', brand: null, ean: null }

test('the Código row types a code by hand and fills only empty fields', async () => {
  vi.mocked(getBarcode).mockResolvedValue(leche)
  const { onCorrect, onToast } = renderSheet(blank)

  fireEvent.click(screen.getByRole('button', { name: /código\s*sin código/i }))
  const input = screen.getByRole('textbox', { name: 'Código' })
  fireEvent.change(input, { target: { value: '8480000' } })
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  fireEvent.change(input, { target: { value: '8480000118325' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  await waitFor(() =>
    expect(onCorrect).toHaveBeenCalledWith({
      ean: '8480000118325',
      brand: 'Hacendado',
    }),
  )
  expect(onToast).toHaveBeenCalledWith({
    lead: 'Código guardado.',
    message: 'Marca y formato añadidos desde Open Food Facts.',
  })
})

test('the scan button reads a code with the same flow', async () => {
  vi.mocked(getBarcode).mockResolvedValue(leche)
  const { onCorrect } = renderSheet(blank)

  fireEvent.click(
    screen.getByRole('button', { name: 'Escanear el código de barras' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Leer (mock)' }))

  await waitFor(() =>
    expect(onCorrect).toHaveBeenCalledWith({
      ean: '8480000118325',
      brand: 'Hacendado',
    }),
  )
})

test('a code the catalogue does not know is saved anyway', async () => {
  vi.mocked(getBarcode).mockRejectedValue(new ApiError(404, 'Not found'))
  const { onCorrect, onToast } = renderSheet(blank)

  fireEvent.click(
    screen.getByRole('button', { name: 'Escanear el código de barras' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Leer (mock)' }))

  await waitFor(() =>
    expect(onCorrect).toHaveBeenCalledWith({ ean: '8480000118325' }),
  )
  expect(onToast).toHaveBeenCalledWith({
    lead: 'Código guardado.',
    message:
      'Open Food Facts no lo conoce, así que no hay más datos que añadir.',
  })
})

test('another code on the line asks before replacing it', async () => {
  vi.mocked(getBarcode).mockResolvedValue(leche)
  const { onCorrect } = renderSheet({ ...blank, ean: '8480000118318' })

  fireEvent.click(
    screen.getByRole('button', { name: 'Escanear el código de barras' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Leer (mock)' }))
  expect(screen.getByText('¿Cambiar el código?')).toBeInTheDocument()
  expect(screen.getByText('Escaneado')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Dejar el que tiene' }))
  expect(onCorrect).not.toHaveBeenCalled()

  fireEvent.click(
    screen.getByRole('button', { name: 'Escanear el código de barras' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Leer (mock)' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar el código' }))
  await waitFor(() => expect(onCorrect).toHaveBeenCalled())
})

async function scanLeche(over: Partial<ListItem>) {
  vi.mocked(getBarcode).mockResolvedValue(leche)
  const handlers = renderSheet({ ...blank, ...over })
  fireEvent.click(
    screen.getByRole('button', { name: 'Escanear el código de barras' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Leer (mock)' }))
  await waitFor(() => expect(handlers.onCorrect).toHaveBeenCalled())
  return handlers
}

test('a name the catalogue spells otherwise is a suggestion, open after the scan', async () => {
  const { onRename } = await scanLeche({ name: 'Leche' })

  const tip = await screen.findByRole('group', {
    name: 'Nombre en Open Food Facts',
  })
  expect(tip).toHaveTextContent('Leche semidesnatada')
  expect(tip).toHaveTextContent('de Open Food Facts')

  fireEvent.click(screen.getByRole('button', { name: 'Usar' }))
  expect(onRename).toHaveBeenCalledWith('Leche semidesnatada')
})

test('a taken suggestion can be undone while the sheet is open', async () => {
  const { onRename, update } = await scanLeche({ name: 'Leche' })
  await screen.findByRole('group', { name: 'Nombre en Open Food Facts' })
  fireEvent.click(screen.getByRole('button', { name: 'Usar' }))
  update({ name: 'Leche semidesnatada' })
  expect(
    screen.getByRole('button', { name: 'Deshacer nombre' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('group', { name: 'Nombre anterior' }),
  ).toHaveTextContent('Antes')
  onRename.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
  expect(onRename).toHaveBeenCalledWith('Leche')
})

test('an ignored suggestion leaves the sheet', async () => {
  await scanLeche({ name: 'Leche' })
  await screen.findByRole('group', { name: 'Nombre en Open Food Facts' })
  fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }))
  expect(
    screen.queryByRole('button', { name: 'Nombre en Open Food Facts' }),
  ).toBeNull()
})

test('a filled brand is no suggestion, a different one is', async () => {
  await scanLeche({ brand: 'Pascual' })
  // Name agrees, so the brand is the first that differs.
  expect(
    await screen.findByRole('group', { name: 'Marca en Open Food Facts' }),
  ).toBeInTheDocument()
})

test('a different format keeps the typed one and is offered with its source', async () => {
  const { onCorrect } = await scanLeche({
    brand: 'Hacendado',
    pack: { count: 12, content: 1, unit: 'l' },
    pack_source: 'manual',
  })
  const tip = await screen.findByRole('group', {
    name: 'Formato en Open Food Facts',
  })
  expect(tip).toHaveTextContent('6 × 1 L')
  onCorrect.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Usar' }))
  expect(onCorrect).toHaveBeenCalledWith({
    pack: leche.pack,
    pack_source: 'off',
    ean: '8480000118325',
  })
})

test('opening the sheet looks nothing up: no suggestion without a scan', async () => {
  renderSheet({ name: 'Leche', ean: '8480000118325' })
  await waitFor(() => expect(getPriceHistory).toHaveBeenCalled())
  expect(getBarcode).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /open food facts/i })).toBeNull()
})

test('a format from the catalogue says where it came from', () => {
  renderSheet({
    pack: { count: 6, content: 1, unit: 'l' },
    pack_source: 'off',
  })
  expect(screen.getByText('de Open Food Facts')).toBeInTheDocument()
})
