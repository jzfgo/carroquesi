import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as FeatureFlagsContextModule from '../contexts/FeatureFlagsContext'
import * as useListItemsModule from '../hooks/useListItems'
import * as api from '../lib/api'
import * as receiptAi from '../lib/receiptAi'
import type {
  BarcodeRead,
  ListItem,
  NameMapping,
  NewPurchasedItem,
  PricePatch,
  ReceiptScanResult,
} from '../types'
import { ListScreen } from './ListScreen'

vi.mock('@undecaf/barcode-detector-polyfill', () => ({
  BarcodeDetectorPolyfill: class {
    detect() {
      return Promise.resolve([])
    }
  },
}))

// Shared fixtures referenced from vi.mock factories below — vi.mock calls are
// hoisted above regular top-level const declarations, so anything a factory
// closes over must come from vi.hoisted() to avoid a TDZ error at import time.
const { mockNewItem, mockScannedProduct } = vi.hoisted(() => ({
  mockNewItem: {
    name: 'Cacahuetes dulces',
    brand: 'Hacendado',
    ean: null,
    price: 3.15,
    price_per: null,
    store: 'Mercadona',
    quantity: '1',
  },
  mockScannedProduct: {
    ean: '8412345678901',
    name: 'Cacahuetes dulces',
    brand: 'Hacendado',
    stores: [],
    community_price: null,
    community_price_per: null,
  },
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: vi.fn(),
}))
vi.mock('../hooks/useListItems')
vi.mock('../hooks/useQueueDrain', () => ({
  useQueueDrain: vi.fn(() => ({ pendingCount: 0 })),
}))
vi.mock('../lib/api')
vi.mock('../lib/receiptAi', () => ({ parseReceiptWithAi: vi.fn() }))
vi.mock('./ListMembersSheet', () => ({
  ListMembersSheet: () => (
    <div role="dialog" aria-label="Miembros">
      Sheet
    </div>
  ),
}))
// Simulates the real scanner resolving a single fixed product, so tests can
// drive the receipt-line-scan flow without a camera or barcode API.
vi.mock('./BarcodeScanner', () => ({
  BarcodeScanner: ({
    onResult,
  }: {
    onResult: (product: BarcodeRead) => void
  }) => (
    <button onClick={() => onResult(mockScannedProduct)}>
      Escanear producto (mock)
    </button>
  ),
}))
vi.mock('./ReceiptScanSheet', () => ({
  default: ({
    onConfirm,
    onRequestScan,
    pendingScan,
  }: {
    onConfirm: (
      patches: PricePatch[],
      mappings: NameMapping[],
      newItems: NewPurchasedItem[],
    ) => Promise<boolean>
    onRequestScan?: (index: number) => void
    pendingScan?: { index: number; product: BarcodeRead } | null
  }) => (
    <div>
      {/* Surfaces the pendingScan this instance was mounted with, so tests
          can prove a stale scan from a prior session doesn't leak in. */}
      <div data-testid="mock-pending-scan">
        {pendingScan ? pendingScan.product.ean : 'null'}
      </div>
      <button onClick={() => void onConfirm([], [], [])}>
        Confirmar (mock)
      </button>
      <button onClick={() => void onConfirm([], [], [mockNewItem])}>
        Confirmar con artículo nuevo (mock)
      </button>
      {onRequestScan && (
        <button onClick={() => onRequestScan(0)}>Escanear línea (mock)</button>
      )}
    </div>
  ),
}))

const mockGetToken = vi.fn().mockResolvedValue('token')

const emptyHookResult = {
  status: 'success' as const,
  items: [] as ListItem[],
  members: new Map(),
  togglePurchased: vi.fn(),
  addItem: vi.fn(),
  updateTag: vi.fn(),
  updateStores: vi.fn(),
  renameItem: vi.fn(),
  removeItem: vi.fn(),
  savePrice: vi.fn(),
  clearItemPrice: vi.fn(),
  retry: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: {
      id: 'u1',
      displayName: 'Alice',
      photoUrl: null,
      email: 'alice@example.com',
      features: [],
    },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: false,
  })
  vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
    isEnabled: () => true,
  })
  vi.mocked(useListItemsModule.useListItems).mockReturnValue(emptyHookResult)
  vi.mocked(api.getSuggestions).mockResolvedValue([])
  vi.mocked(api.getDueSuggestions).mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

const TODAY = new Date().toISOString().slice(0, 19)
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19)

function makeItem(overrides: Partial<ListItem>): ListItem {
  return {
    id: 'x',
    list_id: 'l1',
    name: 'Item',
    quantity: null,
    brand: null,
    stores: [],
    purchased: false,
    purchased_at: null,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: TODAY,
    updated_at: TODAY,
    ...overrides,
  }
}

describe('ListScreen', () => {
  it('renders the list name in the header', () => {
    render(
      <ListScreen
        listId="l1"
        listName="Mercado Semanal"
        listOwnerId="owner-1"
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Mercado Semanal' }),
    ).toBeInTheDocument()
  })

  it('opens ListActionSheet when menu button is clicked', () => {
    render(
      <ListScreen listId="l1" listName="Mercado Semanal" listOwnerId="u1" />,
    )
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    expect(
      screen.getByRole('dialog', { name: /Opciones de lista/i }),
    ).toBeInTheDocument()
  })

  it('renders emoji before the list name in the header when provided', () => {
    render(
      <ListScreen
        listId="l1"
        listName="Mercado Semanal"
        listEmoji="🛒"
        listOwnerId="owner-1"
      />,
    )
    const heading = screen.getByRole('heading')
    expect(heading.textContent).toContain('🛒')
    expect(heading.textContent).toContain('Mercado Semanal')
  })

  it('existing heading accessible name is unchanged when emoji is provided (emoji is aria-hidden)', () => {
    render(
      <ListScreen
        listId="l1"
        listName="Mercado Semanal"
        listEmoji="🛒"
        listOwnerId="owner-1"
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Mercado Semanal' }),
    ).toBeInTheDocument()
  })

  it('adds an autocomplete suggestion directly with brand and stores', async () => {
    vi.useFakeTimers()
    vi.mocked(api.getSuggestions).mockResolvedValue([
      { name: 'Leche', brand: 'Puleva', stores: ['Mercadona'] },
    ])

    render(
      <ListScreen listId="l1" listName="Mercado Semanal" listOwnerId="u1" />,
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /añadir producto/i }),
      {
        target: { value: 'Le' },
      },
    )

    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await waitFor(() =>
      expect(api.getSuggestions).toHaveBeenCalledWith(mockGetToken, 'Le'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Leche' }))

    expect(emptyHookResult.addItem).toHaveBeenCalledWith({
      name: 'Leche',
      brand: 'Puleva',
      stores: ['Mercadona'],
      quantity: null,
    })
    vi.useRealTimers()
  })

  it('opens TagEditSheet when clicking on brand tag and calls updateTag on save', async () => {
    const updateTagMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas', brand: 'Hacendado' })],
      updateTag: updateTagMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const brandTag = screen.getByText('Hacendado')
    fireEvent.click(brandTag)

    expect(document.querySelector('.tag-edit-sheet')).toBeInTheDocument()

    const input = document.querySelector('.tag-edit-sheet__input')!
    fireEvent.change(input, { target: { value: 'Danone' } })
    fireEvent.click(document.querySelector('.tag-edit-sheet__save')!)

    expect(updateTagMock).toHaveBeenCalledWith('i1', 'brand', 'Danone')
  })

  it('opens StoreEditSheet when clicking on stores tag and calls updateStores on save', async () => {
    const updateStoresMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas', stores: ['Mercadona'] })],
      updateStores: updateStoresMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const storeTag = document.querySelector(
      '.item-card__tag:not(.item-card__tag--cta)',
    )!
    fireEvent.click(storeTag)

    expect(document.querySelector('.store-edit-sheet')).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: /nueva tienda/i })
    fireEvent.change(input, { target: { value: 'Carrefour' } })
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))

    expect(updateStoresMock).toHaveBeenCalledWith('i1', [
      'Mercadona',
      'Carrefour',
    ])
  })

  it('opens ItemActionSheet when menu button is clicked and handles rename', async () => {
    const renameItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas' })],
      renameItem: renameItemMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const optionsButton = screen.getByRole('button', {
      name: 'Opciones del producto',
    })
    fireEvent.click(optionsButton)

    expect(
      screen.getByRole('dialog', { name: /Opciones del producto/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
    const input = screen.getByRole('textbox', { name: 'Nombre del producto' })
    fireEvent.change(input, { target: { value: 'Manzanas Rojas' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(renameItemMock).toHaveBeenCalledWith('i1', 'Manzanas Rojas')
  })

  it('opens ItemActionSheet when menu button is clicked and handles delete', async () => {
    const removeItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas' })],
      removeItem: removeItemMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const optionsButton = screen.getByRole('button', {
      name: 'Opciones del producto',
    })
    fireEvent.click(optionsButton)

    expect(
      screen.getByRole('dialog', { name: /Opciones del producto/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /eliminar producto/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))

    expect(removeItemMock).toHaveBeenCalledWith('i1')
  })

  it('handles EanSearch finding a product and adding it', async () => {
    const addItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      addItem: addItemMock,
    })

    vi.mocked(api.getBarcode).mockResolvedValueOnce({
      ean: '8412345678901',
      name: 'Tomates',
      brand: 'Carrefour',
      stores: ['Carrefour'],
      community_price: null,
      community_price_per: null,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const input = screen.getByRole('textbox', { name: /añadir producto/i })
    fireEvent.change(input, { target: { value: '|8412345678901' } })

    const searchButton = screen.getByRole('button', {
      name: /buscar producto/i,
    })
    fireEvent.click(searchButton)

    await waitFor(() => {
      expect(api.getBarcode).toHaveBeenCalledWith(
        expect.any(Function),
        '8412345678901',
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Tomates')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))

    expect(addItemMock).toHaveBeenCalledWith({
      name: 'Tomates',
      brand: 'Carrefour',
      stores: [],
      quantity: null,
      ean: '8412345678901',
    })
  })

  it('opens DueSuggestionsSheet and handles adding suggestions', async () => {
    const addItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      addItem: addItemMock,
    })

    vi.mocked(api.getDueSuggestions).mockResolvedValueOnce([
      {
        name: 'Yogur',
        brand: 'Danone',
        stores: ['Mercadona'],
        days_overdue: 1,
        dismissal_ttl_days: 7,
        median_interval_days: 7,
        days_since_last: 8,
        avg_quantity: 2,
      },
    ])

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const suggestionsBtn = await screen.findByRole('button', {
      name: /sugerencias pendientes \(1\)/i,
    })
    fireEvent.click(suggestionsBtn)

    expect(screen.getByText('Toca comprar')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /añadir Yogur/i }))

    expect(addItemMock).toHaveBeenCalledWith({
      name: 'Yogur',
      brand: 'Danone',
      stores: ['Mercadona'],
      quantity: '2',
    })
  })

  it('handles cloning a purchased item', async () => {
    const addItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [
        makeItem({
          id: 'i1',
          name: 'Manzanas',
          purchased: true,
          purchased_at: TODAY,
        }),
      ],
      addItem: addItemMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const optionsButton = screen.getByRole('button', {
      name: 'Opciones del producto',
    })
    fireEvent.click(optionsButton)

    fireEvent.click(screen.getByRole('button', { name: /comprar de nuevo/i }))

    expect(addItemMock).toHaveBeenCalledWith({
      name: 'Manzanas',
      brand: null,
      stores: [],
      quantity: null,
      ean: null,
    })
  })
})

describe('ProgressBar scoping', () => {
  function renderWithItems(items: ListItem[]) {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items,
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
  }

  it('hides the bar when there are no in-scope items', () => {
    renderWithItems([])
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('counts only unpurchased items when nothing is purchased yet', () => {
    renderWithItems([makeItem({ id: '1' }), makeItem({ id: '2' })])
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
  })

  it('shows 100% when all items were purchased today', () => {
    renderWithItems([
      makeItem({ id: '1', purchased: true, purchased_at: TODAY }),
      makeItem({ id: '2', purchased: true, purchased_at: TODAY }),
    ])
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
  })

  it('excludes items purchased on a prior day from both numerator and denominator', () => {
    renderWithItems([
      makeItem({ id: '1' }), // unpurchased → in scope
      makeItem({ id: '2', purchased: true, purchased_at: TODAY }), // purchased today → in scope
      makeItem({ id: '3', purchased: true, purchased_at: YESTERDAY }), // old → excluded
    ])
    // total = 2 (items 1 + 2), purchased = 1 (item 2) → 50%
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
  })

  it('hides the bar when all purchased items are from prior days and none are unpurchased', () => {
    renderWithItems([
      makeItem({ id: '1', purchased: true, purchased_at: YESTERDAY }),
    ])
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('cost totals', () => {
  function renderWithItems(items: ListItem[]) {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items,
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
  }

  it('shows total for unpurchased items when all are priced', () => {
    renderWithItems([
      makeItem({ id: '1', price: 2.5 }),
      makeItem({ id: '2', price: 1.0 }),
    ])
    expect(screen.getByText(/3[,.]50/)).toBeInTheDocument()
    expect(
      document.querySelector('.item-list__label-cost'),
    ).not.toHaveTextContent('≥')
  })

  it('shows ≥ prefix when some unpurchased items lack a price', () => {
    renderWithItems([makeItem({ id: '1', price: 2.0 }), makeItem({ id: '2' })])
    expect(
      document.querySelector('.item-list__label-cost')?.textContent,
    ).toMatch(/≥/)
  })

  it('applies plain quantity multiplier', () => {
    renderWithItems([makeItem({ id: '1', price: 2.0, quantity: '3' })])
    // 2 × 3 = 6
    expect(screen.getByText(/6[,.]00/)).toBeInTheDocument()
  })

  it('applies SI quantity to per-kg price', () => {
    renderWithItems([
      makeItem({ id: '1', price: 10, price_per: 'KILOGRAM', quantity: '500g' }),
    ])
    // 10 × 0.5 = 5
    expect(screen.getByText(/5[,.]00/)).toBeInTheDocument()
  })

  it('treats SI quantity as pack descriptor for unit-priced item', () => {
    renderWithItems([makeItem({ id: '1', price: 1.5, quantity: '500g' })])
    // 1.5 × 1 = 1.5 — badge present, no ≥
    expect(
      document.querySelector('.item-list__label-cost')?.textContent,
    ).toMatch(/1[,.]50/)
    expect(
      document.querySelector('.item-list__label-cost')?.textContent,
    ).not.toMatch(/≥/)
  })

  it('renders no cost badge when per-kg item has no usable unit in quantity', () => {
    renderWithItems([
      makeItem({ id: '1', price: 10, price_per: 'KILOGRAM', quantity: '2' }),
    ])
    // total = 0 → null summary → no badge
    expect(
      document.querySelector('.item-list__label-cost'),
    ).not.toBeInTheDocument()
  })

  it('shows cost next to the purchased date label', () => {
    renderWithItems([
      makeItem({ id: '1', purchased: true, purchased_at: TODAY, price: 3.0 }),
    ])
    expect(
      document.querySelector('.item-list__date-label-cost'),
    ).toBeInTheDocument()
    expect(
      document.querySelector('.item-list__date-label-cost')?.textContent,
    ).toMatch(/3[,.]00/)
  })

  it('renders no cost badge when no items have prices', () => {
    renderWithItems([makeItem({ id: '1' }), makeItem({ id: '2' })])
    expect(
      document.querySelector('.item-list__label-cost'),
    ).not.toBeInTheDocument()
  })
})

describe('receipt scan CTA', () => {
  const PURCHASED_ITEM = makeItem({
    id: 'i1',
    purchased: true,
    purchased_at: TODAY,
  })

  it('shows receipt scan CTA when all items are purchased and flag is enabled', () => {
    vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
      isEnabled: () => true,
    })
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [PURCHASED_ITEM],
    })
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    expect(screen.getByText(/Escanear ticket/)).toBeInTheDocument()
  })

  it('hides receipt scan CTA when flag is disabled', () => {
    vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
      isEnabled: () => false,
    })
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [PURCHASED_ITEM],
    })
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    expect(screen.queryByText(/Escanear ticket/)).not.toBeInTheDocument()
  })
})

describe('receipt price confirmation toast', () => {
  const mockScanResult: ReceiptScanResult = {
    scan_id: 'scan-1',
    store: 'Mercadona',
    receipt_date: '2026-07-20',
    receipt_total: 10,
    matched: [],
    unmatched: [],
  }

  beforeEach(() => {
    vi.mocked(receiptAi.parseReceiptWithAi).mockResolvedValue({
      store: 'Mercadona',
      receipt_date: '2026-07-20',
      receipt_total: 10,
      lines: [],
    })
    vi.mocked(api.submitParsedReceipt).mockResolvedValue(mockScanResult)
  })

  async function openReceiptSheetAndConfirm() {
    const { container } = render(
      <ListScreen listId="list1" listName="Test" listOwnerId="u1" />,
    )
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(await screen.findByText('Confirmar (mock)'))
  }

  it('reports only the price clause when nothing was created', async () => {
    vi.mocked(api.submitReceiptPrices).mockResolvedValue({
      items_updated: 2,
      items_created: 0,
    })
    await openReceiptSheetAndConfirm()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('2 precios actualizados')
    expect(alert).not.toHaveTextContent('artículo')
  })

  it('reports only the created-items clause when no prices changed', async () => {
    vi.mocked(api.submitReceiptPrices).mockResolvedValue({
      items_updated: 0,
      items_created: 3,
    })
    await openReceiptSheetAndConfirm()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('3 artículos añadidos')
    expect(alert).not.toHaveTextContent('precio')
  })

  it('reports both clauses when prices and new items are both present', async () => {
    vi.mocked(api.submitReceiptPrices).mockResolvedValue({
      items_updated: 1,
      items_created: 1,
    })
    await openReceiptSheetAndConfirm()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 precio actualizado · 1 artículo añadido')
  })

  it('falls back to a neutral toast when nothing changed', async () => {
    vi.mocked(api.submitReceiptPrices).mockResolvedValue({
      items_updated: 0,
      items_created: 0,
    })
    await openReceiptSheetAndConfirm()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se guardó nada')
  })

  it('calls submitReceiptPrices with the payload the sheet produced, not just a truthy shape', async () => {
    vi.mocked(api.submitReceiptPrices).mockResolvedValue({
      items_updated: 0,
      items_created: 1,
    })
    const { container } = render(
      <ListScreen listId="list1" listName="Test" listOwnerId="u1" />,
    )
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(
      await screen.findByText('Confirmar con artículo nuevo (mock)'),
    )
    await waitFor(() =>
      expect(api.submitReceiptPrices).toHaveBeenCalledTimes(1),
    )
    // scan_id and receipt_date are asserted as distinct values on purpose —
    // this is what would catch one being sent in the other's place.
    expect(api.submitReceiptPrices).toHaveBeenCalledWith(
      mockGetToken,
      'list1',
      {
        scan_id: 'scan-1',
        receipt_date: '2026-07-20',
        patches: [],
        new_items: [mockNewItem],
        mappings: [],
      },
    )
  })
})

describe('pendingScan session isolation', () => {
  const mockScanResult: ReceiptScanResult = {
    scan_id: 'scan-1',
    store: 'Mercadona',
    receipt_date: '2026-07-20',
    receipt_total: 10,
    matched: [],
    unmatched: [],
  }

  beforeEach(() => {
    vi.mocked(receiptAi.parseReceiptWithAi).mockResolvedValue({
      store: 'Mercadona',
      receipt_date: '2026-07-20',
      receipt_total: 10,
      lines: [],
    })
    vi.mocked(api.submitParsedReceipt).mockResolvedValue(mockScanResult)
    vi.mocked(api.submitReceiptPrices).mockResolvedValue({
      items_updated: 1,
      items_created: 0,
    })
  })

  it('does not leak a scanned product from one receipt session into the next', async () => {
    const { container } = render(
      <ListScreen listId="list1" listName="Test" listOwnerId="u1" />,
    )
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement

    // Session 1: open the sheet, request a scan for a row, and let the
    // (mocked) scanner resolve a product into it.
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'r1.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.click(await screen.findByText('Escanear línea (mock)'))
    fireEvent.click(await screen.findByText('Escanear producto (mock)'))
    expect(await screen.findByTestId('mock-pending-scan')).toHaveTextContent(
      mockScannedProduct.ean,
    )

    // Confirm session 1 — the sheet unmounts.
    fireEvent.click(screen.getByText('Confirmar (mock)'))
    await waitFor(() =>
      expect(api.submitReceiptPrices).toHaveBeenCalledTimes(1),
    )

    // Session 2: a fresh scan session must start with no pendingScan.
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'r2.jpg', { type: 'image/jpeg' })] },
    })
    expect(await screen.findByTestId('mock-pending-scan')).toHaveTextContent(
      'null',
    )
  })
})
