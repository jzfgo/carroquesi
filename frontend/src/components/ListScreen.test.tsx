import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as FeatureFlagsContextModule from '../contexts/FeatureFlagsContext'
import * as useListItemsModule from '../hooks/useListItems'
import * as api from '../lib/api'
import { reportRequestOutcome } from '../lib/connectivity'
import {
  isDismissed,
  _resetCacheForTesting as resetDismissals,
} from '../lib/dismissedSuggestions'
import * as push from '../lib/push'
import * as receiptAi from '../lib/receiptAi'
import type {
  BarcodeRead,
  ListItem,
  ListStoreEntry,
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
  },
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: vi.fn(),
}))
vi.mock('../hooks/useListItems')
// Stubbed so no transitive import builds the real Firebase app, which needs
// credentials the test runner does not have. Null messaging short-circuits
// the push lifecycle.
vi.mock('../lib/firebase', () => ({
  getFirebaseAuth: vi.fn(() => ({ currentUser: null })),
  getFirebaseAi: vi.fn(() => ({})),
  getMessagingIfSupported: vi.fn(() => Promise.resolve(null)),
}))
// Partial mock so the priming-card tests can script the permission and the
// enablePush outcome; importOriginal keeps the exports they don't touch.
vi.mock('../lib/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/push')>()),
  canReceivePush: vi.fn(),
  enablePush: vi.fn(),
  permissionState: vi.fn(),
}))
vi.mock('../lib/api')
vi.mock('../lib/receiptAi', () => ({ parseReceiptWithAi: vi.fn() }))
// Exposes the two report callbacks as buttons so tests can prove they arrive
// through the real ListActionSheet, not just that ListScreen defines them.
vi.mock('./ListMembersSheet', () => ({
  ListMembersSheet: ({
    onLeft,
    onListSuspect,
  }: {
    onLeft?: () => void
    onListSuspect?: () => void
  }) => (
    <div role="dialog" aria-label="Miembros">
      {onLeft && <button onClick={() => onLeft()}>Salir (mock)</button>}
      {onListSuspect && (
        <button onClick={() => onListSuspect()}>Sospechar (mock)</button>
      )}
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
    result,
    store,
    onConfirm,
    onReReadReceipt,
    onRequestScan,
    pendingScan,
  }: {
    result: ReceiptScanResult
    store: string | null
    onConfirm: (
      patches: PricePatch[],
      mappings: NameMapping[],
      newItems: NewPurchasedItem[],
      meta: { receiptDate: string | null; store: string | null },
    ) => Promise<boolean>
    onReReadReceipt: () => void
    onRequestScan?: (index: number) => void
    pendingScan?: { index: number; product: BarcodeRead } | null
  }) => {
    // The sheet now owns the editable date/store and hands them back as meta;
    // the real one seeds them from result/store, so the mock mirrors that.
    const meta = { receiptDate: result.receipt_date ?? null, store }
    return (
      <div>
        {/* Surfaces the pendingScan this instance was mounted with, so tests
            can prove a stale scan from a prior session doesn't leak in. */}
        <div data-testid="mock-pending-scan">
          {pendingScan ? pendingScan.product.ean : 'null'}
        </div>
        <button onClick={() => void onConfirm([], [], [], meta)}>
          Confirmar (mock)
        </button>
        <button onClick={() => void onConfirm([], [], [mockNewItem], meta)}>
          Confirmar con artículo nuevo (mock)
        </button>
        <button onClick={() => onReReadReceipt()}>Volver a leer (mock)</button>
        {onRequestScan && (
          <button onClick={() => onRequestScan(0)}>
            Escanear línea (mock)
          </button>
        )}
      </div>
    )
  },
}))

const mockGetToken = vi.fn(async () => 'token')

const emptyHookResult = {
  status: 'success' as const,
  items: [] as ListItem[],
  members: new Map(),
  storeEntries: [] as ListStoreEntry[],
  displayStore: (raw: string) => raw,
  applyStoreRename: vi.fn(),
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
  // useListSeen fires on mount and chains .catch on the result; the api
  // automock would otherwise return undefined.
  vi.mocked(api.markListSeen).mockResolvedValue(null)
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: {
      id: 'u1',
      displayName: 'Alice',
      photoUrl: null,
      email: 'alice@example.com',
      features: [],
      receiptConsent: null,
    },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: false,
    recordReceiptConsent: vi.fn(),
  })
  vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
    isEnabled: () => true,
  })
  vi.mocked(useListItemsModule.useListItems).mockReturnValue(emptyHookResult)
  vi.mocked(api.getSuggestions).mockResolvedValue([])
  vi.mocked(api.getDueSuggestions).mockResolvedValue([])
  // The list now mounts the stack (18a), which fetches purchases on render.
  vi.mocked(api.getPurchases).mockResolvedValue({ purchases: [], total: 0 })
  vi.mocked(api.getPurchaseItems).mockResolvedValue([])
  // The product ficha fetches its price history on open.
  vi.mocked(api.getPriceHistory).mockResolvedValue({ entries: [] })
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
    purchased_quantity: null,
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

  it('opens TagEditSheet via row tap → Marca and calls updateTag on save', async () => {
    const updateTagMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas', brand: 'Hacendado' })],
      updateTag: updateTagMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: /manzanas/i }))
    fireEvent.click(screen.getByRole('button', { name: /marca/i }))

    expect(document.querySelector('.tag-edit-sheet')).toBeInTheDocument()

    const input = document.querySelector('.tag-edit-sheet__input')!
    fireEvent.change(input, { target: { value: 'Danone' } })
    fireEvent.click(document.querySelector('.tag-edit-sheet__save')!)

    expect(updateTagMock).toHaveBeenCalledWith('i1', 'brand', 'Danone')
  })

  it('opens StoreEditSheet via row tap → Tiendas and calls updateStores on save', async () => {
    const updateStoresMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas', stores: ['Mercadona'] })],
      updateStores: updateStoresMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: /manzanas/i }))
    fireEvent.click(screen.getByRole('button', { name: /tiendas/i }))

    expect(document.querySelector('.store-edit-sheet')).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: /nueva tienda/i })
    fireEvent.change(input, { target: { value: 'Carrefour' } })
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))

    expect(updateStoresMock).toHaveBeenCalledWith('i1', [
      'Mercadona',
      'Carrefour',
    ])
  })

  it('renders one filter chip per store across spelling variants', () => {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [
        makeItem({ id: 'i1', name: 'Pan', stores: ['Ahorramás'] }),
        makeItem({ id: 'i2', name: 'Queso', stores: ['AHORRA MAS'] }),
        makeItem({ id: 'i3', name: 'Sal', stores: ['Lidl'] }),
      ],
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const filterBar = within(
      document.querySelector('.filter-bar') as HTMLElement,
    )
    expect(
      filterBar.getByRole('button', { name: 'Ahorramás' }),
    ).toBeInTheDocument()
    expect(
      filterBar.queryByRole('button', { name: 'AHORRA MAS' }),
    ).not.toBeInTheDocument()
    expect(filterBar.getByRole('button', { name: 'Lidl' })).toBeInTheDocument()
  })

  it('labels chips and item rows with the registry canonical name', () => {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Pan', stores: ['ahorra mas'] })],
      storeEntries: [{ store_key: 'ahorramas', display_name: 'Ahorramas' }],
      displayStore: (raw: string) =>
        raw.toLowerCase().replace(/\s/g, '') === 'ahorramas'
          ? 'Ahorramas'
          : raw,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    const filterBar = within(
      document.querySelector('.filter-bar') as HTMLElement,
    )
    expect(
      filterBar.getByRole('button', { name: 'Ahorramas' }),
    ).toBeInTheDocument()
    // The store group header resolves through the same function. A pending
    // row's own meta names no shop — the header already does.
    expect(document.querySelector('.item-list__store-label')).toHaveTextContent(
      'Ahorramas',
    )
    expect(document.querySelector('.item-card__meta')).not.toBeInTheDocument()
  })

  it('opens the product ficha when the row is tapped and handles rename', async () => {
    const renameItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas' })],
      renameItem: renameItemMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: /manzanas/i }))

    // The ficha's dialog is named for the product itself.
    expect(screen.getByRole('dialog', { name: 'Manzanas' })).toBeInTheDocument()

    // The Nombre field opens the rename editor in place.
    fireEvent.click(screen.getByRole('button', { name: /nombre/i }))
    const input = screen.getByRole('textbox', { name: 'Nombre del producto' })
    fireEvent.change(input, { target: { value: 'Manzanas Rojas' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(renameItemMock).toHaveBeenCalledWith('i1', 'Manzanas Rojas')
  })

  it('opens the product ficha when the row is tapped and handles delete', async () => {
    const removeItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas' })],
      removeItem: removeItemMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: /manzanas/i }))

    expect(screen.getByRole('dialog', { name: 'Manzanas' })).toBeInTheDocument()

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

  it('accepts an inline suggestion, adding it with its average quantity', async () => {
    const addItemMock = vi.fn()
    // Suggestions render only at the tail of a populated list (20b, Q2), so the
    // hook needs a real pending item for the "Sueles comprar" block to appear.
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Pan' })],
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

    // No sheet, no ✨ button: the row is written straight onto the paper.
    const acceptBtn = await screen.findByRole('button', {
      name: /añadir Yogur/i,
    })
    expect(screen.getByText('Sueles comprar')).toBeInTheDocument()

    fireEvent.click(acceptBtn)

    expect(addItemMock).toHaveBeenCalledWith({
      name: 'Yogur',
      brand: 'Danone',
      stores: ['Mercadona'],
      quantity: '2',
    })
  })

  it('dismisses an inline suggestion, recording a TTL so it stays hidden', async () => {
    localStorage.clear()
    resetDismissals()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Pan' })],
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

    await screen.findByRole('button', { name: /añadir Yogur/i })
    fireEvent.click(
      screen.getByRole('button', { name: /descartar sugerencia/i }),
    )

    // The row is gone and a dismissal TTL was written — «no este mes».
    expect(
      screen.queryByRole('button', { name: /añadir Yogur/i }),
    ).not.toBeInTheDocument()
    expect(isDismissed('Yogur')).toBe(true)
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

    fireEvent.click(screen.getByRole('button', { name: /manzanas/i }))

    fireEvent.click(screen.getByRole('button', { name: /volver a comprar/i }))

    expect(addItemMock).toHaveBeenCalledWith({
      name: 'Manzanas',
      brand: null,
      stores: [],
      quantity: null,
      ean: null,
    })
  })

  it('offers no price entry for pending or in-cart items', () => {
    // Prices exist only on closed-trip records: an in-cart item (open trip)
    // and a pending item both open the sheet without a price action.
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [
        makeItem({ id: 'i1', name: 'Manzanas' }),
        makeItem({
          id: 'i2',
          name: 'Peras',
          purchased: true,
          purchased_at: TODAY,
        }),
      ],
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: /manzanas/i }))
    expect(
      screen.queryByRole('button', { name: /historial de precios/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /registrar precio/i }),
    ).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: /peras/i }))
    expect(
      screen.queryByRole('button', { name: /historial de precios/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /registrar precio/i }),
    ).not.toBeInTheDocument()
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

  // The per-date settled cost badge moved out with the «Comprados» block: the
  // stack (18a) shows each trip's own confirmed total now, so there is no
  // item-derived date subtotal in the list to assert.

  it('renders no cost badge when no items have prices', () => {
    renderWithItems([makeItem({ id: '1' }), makeItem({ id: '2' })])
    expect(
      document.querySelector('.item-list__label-cost'),
    ).not.toBeInTheDocument()
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
      inference_source: 'in_cloud',
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

  it('shows "No se pudo leer el ticket" when AI receipt parsing fails', async () => {
    vi.mocked(receiptAi.parseReceiptWithAi).mockRejectedValue(
      new Error('AI failed'),
    )
    const { container } = render(
      <ListScreen listId="list1" listName="Test" listOwnerId="u1" />,
    )
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo leer el ticket')
  })

  it('shows "No se pudo procesar el ticket" when backend submission fails after AI parsing', async () => {
    vi.mocked(receiptAi.parseReceiptWithAi).mockResolvedValue({
      store: 'Mercadona',
      receipt_date: '2026-07-20',
      receipt_total: 10,
      inference_source: 'in_cloud',
      lines: [],
    })
    vi.mocked(api.submitParsedReceipt).mockRejectedValue(
      new Error('Backend failed'),
    )
    const { container } = render(
      <ListScreen listId="list1" listName="Test" listOwnerId="u1" />,
    )
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo procesar el ticket')
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
        // Store and paper total ride along to close the trip these lines settle.
        store: 'Mercadona',
        receipt_total: 10,
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
      inference_source: 'in_cloud',
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

describe('ListScreen — offline refusal keeps user input', () => {
  beforeEach(() => {
    reportRequestOutcome(true)
  })

  afterEach(() => {
    // The connectivity store is module-level state; leave it online so later
    // suites don't inherit an offline world.
    reportRequestOutcome(true)
  })

  // Opens the LogPurchaseSheet the way a user does: row tap on a purchased
  // item → "Registrar precio" → price history → "Actualizar precio".
  async function openLogPurchaseSheet(
    savePriceMock: ReturnType<
      typeof useListItemsModule.useListItems
    >['savePrice'],
  ) {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [
        // A closed-trip record: the price entry exists only there — a
        // pending or in-cart item offers no price affordance at all.
        makeItem({
          id: 'i1',
          name: 'Manzanas',
          purchased: true,
          purchased_at: TODAY,
          purchase_ends_at: YESTERDAY,
          price: 3.15,
        }),
      ],
      savePrice: savePriceMock,
    })
    vi.mocked(api.getPriceHistory).mockResolvedValue({
      entries: [],
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
    fireEvent.click(screen.getByRole('button', { name: /manzanas/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar precio' }))
    fireEvent.click(
      await screen.findByRole('button', { name: /actualizar precio/i }),
    )
    expect(screen.getByText('Registrar compra')).toBeInTheDocument()
  }

  it('an offline submit toasts, keeps the typed input, and sends nothing', async () => {
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
    const input = screen.getByRole('textbox', { name: /añadir producto/i })
    fireEvent.change(input, { target: { value: 'Leche' } })

    act(() => reportRequestOutcome(false))
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
    expect(input).toHaveValue('Leche')
    expect(emptyHookResult.addItem).not.toHaveBeenCalled()
    expect(api.createItem).not.toHaveBeenCalled()
  })

  // These two drive price-save from a settled record's row. The stack (18a,
  // Lane 1) removed that row from the item list; the record's price entry
  // returns through the product ficha (22a) wired in Lane 3 (JAV-162), where
  // these offline / failure cases will be re-homed. Skipped until then.
  it.skip('an offline price save keeps the sheet open and records nothing', async () => {
    const savePriceMock = vi.fn<() => Promise<void>>()
    await openLogPurchaseSheet(savePriceMock)

    act(() => reportRequestOutcome(false))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
    expect(screen.getByText('Registrar compra')).toBeInTheDocument()
    expect(savePriceMock).not.toHaveBeenCalled()
  })

  it.skip('a failed price save toasts and keeps the sheet open', async () => {
    const savePriceMock = vi.fn(() => Promise.reject(new Error('network')))
    await openLogPurchaseSheet(savePriceMock)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el precio',
    )
    expect(screen.getByText('Registrar compra')).toBeInTheDocument()
  })
})

describe('the list stops being the reader’s after mount', () => {
  // The automocked ApiError constructor sets nothing, so give the instance
  // the status the real one would carry.
  function apiError(status: number) {
    const err = new api.ApiError(status, 'answer')
    err.status = status
    return err
  }

  function suspectFromHook() {
    // The hook is fully mocked, so drive the callback ListScreen handed it —
    // the same one a write answering 403/404 would fire.
    const suspect = vi.mocked(useListItemsModule.useListItems).mock.calls[0][3]
    expect(suspect).toBeDefined()
    return suspect!
  }

  it('confirms a suspicious answer with a re-read before evicting', async () => {
    vi.mocked(api.getList).mockRejectedValue(apiError(404))
    const onListGone = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onListGone={onListGone}
      />,
    )

    await act(async () => {
      suspectFromHook()()
    })

    expect(api.getList).toHaveBeenCalledWith(mockGetToken, 'l1')
    await waitFor(() => expect(onListGone).toHaveBeenCalledWith('not_found'))
  })

  it('reports forbidden when the re-read answers 403', async () => {
    vi.mocked(api.getList).mockRejectedValue(apiError(403))
    const onListGone = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onListGone={onListGone}
      />,
    )

    await act(async () => {
      suspectFromHook()()
    })

    await waitFor(() => expect(onListGone).toHaveBeenCalledWith('forbidden'))
  })

  it('one odd answer does not evict when the re-read lands clean', async () => {
    vi.mocked(api.getList).mockResolvedValue({} as never)
    const onListGone = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onListGone={onListGone}
      />,
    )

    await act(async () => {
      suspectFromHook()()
    })

    expect(api.getList).toHaveBeenCalled()
    expect(onListGone).not.toHaveBeenCalled()
  })

  it('a delete answered 404 completes the tap instead of blaming it', async () => {
    vi.mocked(api.deleteList).mockRejectedValue(apiError(404))
    const onBack = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onBack={onBack}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))

    await waitFor(() => expect(onBack).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a delete answered 403 evicts without the failure toast when confirmed', async () => {
    vi.mocked(api.deleteList).mockRejectedValue(apiError(403))
    vi.mocked(api.getList).mockRejectedValue(apiError(403))
    const onListGone = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onListGone={onListGone}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))

    await waitFor(() => expect(onListGone).toHaveBeenCalledWith('forbidden'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a delete answered 403 keeps the toast when the re-read lands clean', async () => {
    vi.mocked(api.deleteList).mockRejectedValue(apiError(403))
    vi.mocked(api.getList).mockResolvedValue({} as never)
    const onListGone = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onListGone={onListGone}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo eliminar la lista',
    )
    expect(onListGone).not.toHaveBeenCalled()
  })

  it('a successful self-removal in the members sheet leaves the screen', async () => {
    const onBack = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onBack={onBack}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    fireEvent.click(screen.getByRole('button', { name: /miembros/i }))
    fireEvent.click(screen.getByText('Salir (mock)'))

    expect(onBack).toHaveBeenCalled()
  })

  it('a suspicion from the members sheet reaches the confirming re-read', async () => {
    vi.mocked(api.getList).mockRejectedValue(apiError(404))
    const onListGone = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Test"
        listOwnerId="u1"
        onListGone={onListGone}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    fireEvent.click(screen.getByRole('button', { name: /miembros/i }))
    fireEvent.click(screen.getByText('Sospechar (mock)'))

    await waitFor(() => expect(onListGone).toHaveBeenCalledWith('not_found'))
  })
})

describe('notification priming card', () => {
  // The card's gate reads the OS permission, which the enablePush mocks move
  // the way the browser would: the click's outcome changes what the next
  // permissionState() call answers.
  let permission: push.PermissionState

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('push-sharing-intent', '1')
    permission = 'default'
    vi.mocked(push.permissionState).mockImplementation(() => permission)
    vi.mocked(push.canReceivePush).mockReturnValue(true)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('retires the card once enabling succeeds', async () => {
    vi.mocked(push.enablePush).mockImplementation(async () => {
      permission = 'granted'
      return 'fcm-token'
    })
    render(<ListScreen listId="l1" listName="Mercado" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Activar avisos' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retires the card on a denial instead of re-offering a dead prompt', async () => {
    vi.mocked(push.enablePush).mockImplementation(async () => {
      permission = 'denied'
      return null
    })
    render(<ListScreen listId="l1" listName="Mercado" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))

    await waitFor(() =>
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a rejected enable shows a notice instead of failing silently', async () => {
    vi.mocked(push.enablePush).mockImplementation(async () => {
      // The OS grant took; minting or registering the token failed after.
      permission = 'granted'
      throw new Error('network')
    })
    render(<ListScreen listId="l1" listName="Mercado" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron activar los avisos',
    )
  })
})

describe('the board under the paper', () => {
  it('maps the list board onto the screen', () => {
    const { container } = render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        board="salvia"
      />,
    )
    expect(container.querySelector('.list-screen')).toHaveAttribute(
      'data-board',
      'salvia',
    )
  })

  it('lands unknown and absent boards on kraft', () => {
    const { container } = render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        board="terrazo"
      />,
    )
    expect(container.querySelector('.list-screen')).toHaveAttribute(
      'data-board',
      'kraft',
    )
    const { container: second } = render(
      <ListScreen listId="l2" listName="Otra" listOwnerId="u1" />,
    )
    expect(second.querySelector('.list-screen')).toHaveAttribute(
      'data-board',
      'kraft',
    )
  })
})

describe('receipt-scanning consent gate', () => {
  function setConsent(
    consent: 'granted' | 'declined' | null,
    recordReceiptConsent = vi.fn(async () => undefined),
  ) {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: {
        id: 'u1',
        displayName: 'Alice',
        photoUrl: null,
        email: 'alice@example.com',
        features: [],
        receiptConsent: consent,
      },
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
      isWaitlisted: false,
      recordReceiptConsent,
    })
    return recordReceiptConsent
  }

  async function tapScanFromOptions() {
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    await screen.findByRole('dialog', { name: /Opciones de lista/i })
    fireEvent.click(screen.getByRole('button', { name: 'Escanear ticket' }))
  }

  it('asks for consent on the first scan attempt, before any source picker', async () => {
    setConsent(null)
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    await tapScanFromOptions()
    expect(
      await screen.findByRole('button', { name: 'Activar escaneo' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Tomar foto')).not.toBeInTheDocument()
  })

  it('records the grant and continues straight into the scan', async () => {
    const record = setConsent(null)
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    await tapScanFromOptions()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Activar escaneo' }),
    )
    expect(record).toHaveBeenCalledWith('granted')
    expect(await screen.findByText('Tomar foto')).toBeInTheDocument()
  })

  it('does not open the source picker when saving the grant fails', async () => {
    setConsent(
      null,
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    await tapScanFromOptions()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Activar escaneo' }),
    )
    // The write drives the scan, not the exit animation: a failed PUT surfaces
    // the toast, keeps the disclosure open to retry, and never opens the picker
    // (which would fire the Gemini parse with consent unsaved).
    expect(
      await screen.findByText(
        'No se pudo guardar tu preferencia. Inténtalo de nuevo.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Tomar foto')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Activar escaneo' }),
    ).toBeInTheDocument()
  })

  it('re-shows the disclosure when consent was previously declined', async () => {
    setConsent('declined')
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    await tapScanFromOptions()
    expect(
      await screen.findByRole('button', { name: 'Activar escaneo' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Tomar foto')).not.toBeInTheDocument()
  })

  it('goes straight to the source picker when consent was already granted', async () => {
    setConsent('granted')
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    await tapScanFromOptions()
    expect(await screen.findByText('Tomar foto')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Activar escaneo' }),
    ).not.toBeInTheDocument()
  })
})
