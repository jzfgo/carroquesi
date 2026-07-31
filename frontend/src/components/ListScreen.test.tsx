import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as FeatureFlagsContextModule from '../contexts/FeatureFlagsContext'
import * as useListItemsModule from '../hooks/useListItems'
import * as api from '../lib/api'
import * as offlineQueue from '../lib/offlineQueue'
import * as receiptAi from '../lib/receiptAi'
import { madridDay } from '../lib/tripDay'
import type { BarcodeRead, ListItem, ReceiptScanResult } from '../types'
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
const { mockScannedProduct } = vi.hoisted(() => ({
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
// lib/push imports lib/firebase, which calls getAuth() at module scope and
// throws auth/invalid-api-key without Firebase env vars -- as in CI, where a
// local .env would otherwise hide it. Mock the module, not the env.
vi.mock('../lib/firebase', () => ({
  auth: {},
  ai: {},
  messagingPromise: Promise.resolve(null),
}))
vi.mock('../lib/api')
// Partial, not whole: useQueueDrain still needs the real getAll and remove,
// and a bare factory would drop every export it does not name.
vi.mock('../lib/offlineQueue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/offlineQueue')>()),
  enqueue: vi.fn(),
}))
vi.mock('../lib/receiptAi', () => ({ parseReceiptWithAi: vi.fn() }))
vi.mock('./ListMembersSheet', () => ({
  ListMembersSheet: () => (
    <div role="dialog" aria-label="Miembros">
      Sheet
    </div>
  ),
}))
// Stands in for the camera, resolving a single fixed product, so a test can
// drive the scan flow without a camera or a barcode API.
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
const mockGetToken = vi.fn(async () => 'token')

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
  // useListSeen fires on mount and chains .catch on the result; the api
  // automock would otherwise return undefined.
  vi.mocked(api.markListSeen).mockResolvedValue(null)
  // usePurchases fires on mount and chains .then on the result; the api
  // automock would otherwise return undefined.
  vi.mocked(api.getPurchases).mockResolvedValue([])
  // The item sheet reads the price history on mount, same reason.
  vi.mocked(api.getPriceHistory).mockResolvedValue({
    entries: [],
    community_price: null,
    community_price_per: null,
  })
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
/** A settled purchase. Marked TODAY an item is still in the cart, on the list's
 *  own sheet, and has no date label — only a torn-off trip gets one. */
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19)
/** The trip YESTERDAY belonged to tore off shortly after — still yesterday,
 *  so settled (bought) as of now. */
const YESTERDAY_ENDS_AT = new Date(Date.now() - 86_400_000 + 60 * 60 * 1000)
  .toISOString()
  .slice(0, 19)

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

    // The row carries no chips now — brand lives one tap in, on the item.
    fireEvent.click(screen.getByRole('button', { name: 'Manzanas' }))
    fireEvent.click(screen.getByRole('button', { name: /marca/i }))

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

    // The row carries no chips now — the shop lives one tap in, on the item.
    fireEvent.click(screen.getByRole('button', { name: 'Manzanas' }))
    fireEvent.click(screen.getByRole('button', { name: /tienda/i }))

    expect(document.querySelector('.store-edit-sheet')).toBeInTheDocument()

    const input = screen.getByRole('textbox', { name: /nueva tienda/i })
    fireEvent.change(input, { target: { value: 'Carrefour' } })
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))

    expect(updateStoresMock).toHaveBeenCalledWith('i1', [
      'Mercadona',
      'Carrefour',
    ])
  })

  // Two modal dialogs open at once is one too many. The item sheet listens for
  // Escape on the document, so left standing behind the price sheet it would
  // answer a key meant for the sheet in front and shut itself instead.
  it('closes the item sheet when the price sheet opens over it', async () => {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas' })],
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Manzanas' }))
    expect(document.querySelector('.item-detail')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /registrar un precio/i }),
    )

    expect(document.querySelector('.lps')).toBeInTheDocument()
    expect(document.querySelector('.item-detail')).not.toBeInTheDocument()

    // Escape now reaches the sheet in front, and only that one. Before, the
    // item sheet was still mounted behind and answered first — so the key shut
    // the wrong sheet and left this one standing.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.lps')).not.toBeInTheDocument()
  })

  it('opens ItemDetailSheet when the row is tapped and handles rename', async () => {
    const renameItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas' })],
      renameItem: renameItemMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Manzanas' }))

    // The sheet is the item, so the item's name is what names it.
    expect(screen.getByRole('dialog', { name: 'Manzanas' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Nombre/ }))
    const input = screen.getByRole('textbox', { name: 'Nombre' })
    fireEvent.change(input, { target: { value: 'Manzanas Rojas' } })
    // Exact, because "Guardar un ticket" also starts with "Guardar" now and a
    // loose match picks up both.
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(renameItemMock).toHaveBeenCalledWith('i1', 'Manzanas Rojas')
  })

  it('opens ItemDetailSheet when the row is tapped and handles delete', async () => {
    const removeItemMock = vi.fn()
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', name: 'Manzanas' })],
      removeItem: removeItemMock,
    })

    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Manzanas' }))

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

    fireEvent.click(screen.getByRole('button', { name: 'Manzanas' }))

    fireEvent.click(screen.getByRole('button', { name: /volver a comprar/i }))

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
      makeItem({
        id: '3',
        purchased: true,
        purchased_at: YESTERDAY,
        purchase_id: 'p1',
        purchase_ends_at: YESTERDAY_ENDS_AT,
      }), // old → excluded
    ])
    // total = 2 (items 1 + 2), purchased = 1 (item 2) → 50%
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
  })

  it('hides the bar when all purchased items are from prior days and none are unpurchased', () => {
    renderWithItems([
      makeItem({
        id: '1',
        purchased: true,
        purchased_at: YESTERDAY,
        purchase_id: 'p1',
        purchase_ends_at: YESTERDAY_ENDS_AT,
      }),
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
      makeItem({
        id: '1',
        purchased: true,
        purchased_at: YESTERDAY,
        purchase_id: 'p1',
        purchase_ends_at: YESTERDAY_ENDS_AT,
        price: 3.0,
      }),
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

  it('keeps two same-day trips as separate totals instead of one overwriting the other', () => {
    // The bug this phase introduces and fixes in the same breath: keying the
    // cost map by the rendered date label instead of the trip made a second
    // shop on the same day silently overwrite the first trip's total.
    renderWithItems([
      makeItem({
        id: '1',
        purchased: true,
        purchased_at: YESTERDAY,
        purchase_id: 'tripA',
        purchase_ends_at: YESTERDAY_ENDS_AT,
        price: 3.0,
      }),
      makeItem({
        id: '2',
        purchased: true,
        purchased_at: YESTERDAY,
        purchase_id: 'tripB',
        purchase_ends_at: YESTERDAY_ENDS_AT,
        price: 7.0,
      }),
    ])
    const badges = [
      ...document.querySelectorAll('.item-list__date-label-cost'),
    ].map((b) => b.textContent)
    expect(badges).toHaveLength(2)
    expect(badges.some((t) => t?.match(/3[,.]00/))).toBe(true)
    expect(badges.some((t) => t?.match(/7[,.]00/))).toBe(true)
  })

  it('hands the trips it read to the ticket headers', async () => {
    // The wiring, not the rendering: without the prop the header still draws,
    // it just falls back to the day and the sum, so nothing else notices.
    vi.mocked(api.getPurchases).mockResolvedValue([
      {
        id: 'p1',
        list_id: 'l1',
        opened_at: YESTERDAY,
        tears_off_at: YESTERDAY_ENDS_AT,
        closed_at: YESTERDAY_ENDS_AT,
        store: 'Lidl',
        total: 14.6,
      },
    ])
    renderWithItems([
      makeItem({
        id: '1',
        purchased: true,
        purchased_at: YESTERDAY,
        purchase_id: 'p1',
        purchase_ends_at: YESTERDAY_ENDS_AT,
        price: 3.0,
      }),
    ])
    await waitFor(() =>
      expect(
        document.querySelector('.item-list__date-label-cost')?.textContent,
      ).toMatch(/14[,.]60/),
    )
    expect(
      document.querySelector('.item-list__label-text')?.textContent,
    ).toMatch(/^Lidl · /)
  })

  it('re-reads the trips when the items change, and not on every render', async () => {
    // A trip only ever changes as part of an item write, so the items are the
    // signal and there is no second poll. The item hook keeps the array's
    // identity when a poll finds nothing new, which is what stops this from
    // firing every five seconds.
    const items = [makeItem({ id: '1' })]
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items,
    })
    // A fresh element each time: React bails out of re-rendering one it is
    // handed back by identity, which would prove nothing.
    const screenEl = () => (
      <ListScreen listId="l1" listName="Test" listOwnerId="u1" />
    )
    // Counted against what mount left behind rather than against zero: the
    // hook reads once for itself on mount, so the absolute figure says
    // nothing about the rule under test.
    const reads = () => vi.mocked(api.getPurchases).mock.calls.length
    const view = render(screenEl())
    await waitFor(() => expect(reads()).toBeGreaterThan(0))
    const afterMount = reads()

    view.rerender(screenEl())
    expect(reads()).toBe(afterMount)

    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [...items, makeItem({ id: '2' })],
    })
    view.rerender(screenEl())
    await waitFor(() => expect(reads()).toBe(afterMount + 1))
  })
})

describe('the tear-off boundary under an open tab', () => {
  // The one case no other test covers: nothing about the *items* changes, only
  // the time. Everything ListScreen derives from itemState is memoised, and a
  // memo keyed on `items` alone cache-hits straight through midnight — the
  // screen re-renders on schedule and still shows the pre-boundary answer.
  // Nothing else would correct it either: the 5s poll re-fetches only when
  // `updated_at` moves, and a tear-off is not a write.
  const PURCHASED_AT = '2026-07-28T09:00:00'
  const ENDS_AT = '2026-07-28T12:00:05' // naive-UTC, 5s after the system time

  function renderAtNoon(items: ListItem[]) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items,
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
  }

  const items = () => [
    makeItem({
      id: '1',
      purchased: true,
      purchased_at: PURCHASED_AT,
      purchase_id: 'p1',
      purchase_ends_at: ENDS_AT,
      price: 4.0,
    }),
    makeItem({ id: '2' }), // still to buy, so the bar keeps a denominator
  ]

  it('drops the torn-off trip out of the progress bar', () => {
    renderAtNoon(items())
    // In the cart: counted as done, and still in scope.
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '50',
    )

    act(() => {
      vi.advanceTimersByTime(6000) // boundary + the hook's 1s margin
    })

    // Settled: out of both numerator and denominator, leaving one item to buy.
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
  })

  it('gives the newly torn-off trip its cost badge', () => {
    renderAtNoon(items())
    // A cart item sits on the list's own sheet — no ticket, so no badge.
    expect(
      document.querySelector('.item-list__date-label-cost'),
    ).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(6000)
    })

    // The ticket sheet appears, and it appears *with its total*. ItemList
    // recomputes inline and would show the sheet either way; the badge is
    // looked up in ListScreen's memo, which is the half that used to go stale.
    expect(
      document.querySelector('.item-list__date-label-cost')?.textContent,
    ).toMatch(/4[,.]00/)
  })

  it('empties the cart when the trip is closed rather than torn off', () => {
    // The boundary does not arrive by waiting here — it arrives already past.
    // `closed_at` replaces `tears_off_at` the moment someone saves the close
    // sheet, and the 5s poll can only deliver it after the fact, so there is
    // no timer to fire. That is any member closing the trip, on a list that
    // has been open on this screen since the morning.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T09:00:00Z'))
    const inCart = makeItem({
      id: '1',
      purchased: true,
      purchased_at: '2026-07-28T08:00:00',
      purchase_id: 'p1',
      purchase_ends_at: '2026-07-29T00:00:00', // tears off tonight
      price: 4.0,
    })
    const stillToBuy = makeItem({ id: '2' })
    const withItems = (items: ListItem[]) =>
      vi.mocked(useListItemsModule.useListItems).mockReturnValue({
        ...emptyHookResult,
        items,
      })

    withItems([inCart, stillToBuy])
    const view = render(
      <ListScreen listId="l1" listName="Test" listOwnerId="u1" />,
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '50',
    )

    // Six hours of shopping, then the five seconds the poll takes to notice.
    // Tonight's tear-off timer has not fired and will not: the trip ends by
    // being confirmed, not by lasting until midnight.
    act(() => {
      vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 5000)
    })

    // Confirmed at 15:00; delivered at 15:00:05, already behind the clock.
    //
    // The `+ 5000` in the advance above is load-bearing, not scene-setting —
    // it, and not this timestamp, is what leaves the boundary behind the live
    // clock. What is left to wait is the hook's 1s margin minus the overshoot,
    // and the tick below only advances 1ms, so the overshoot has to cover
    // essentially the whole margin: measured, 999ms settles and 500ms does
    // not. 5000 is slack around a limit of ~1000 — anywhere above it is fine,
    // and only shaving below roughly a second breaks this, which it does
    // loudly, on a progress-bar assertion that says nothing about why.
    withItems([
      { ...inCart, purchase_ends_at: '2026-07-28T15:00:00' },
      stillToBuy,
    ])
    act(() => {
      view.rerender(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
    })
    // The catch-up is scheduled, not synchronous — a setState straight from an
    // effect is a cascading render. Its wait is zero, so a tick settles it.
    act(() => {
      vi.advanceTimersByTime(1)
    })

    // One thing left to buy, and the confirmed shop is a ticket with a total.
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
    expect(
      document.querySelector('.item-list__date-label-cost')?.textContent,
    ).toMatch(/4[,.]00/)
  })
})

describe('receipt scan CTA', () => {
  const PURCHASED_ITEM = makeItem({
    id: 'i1',
    purchased: true,
    purchased_at: TODAY,
  })

  it('offers to save a ticket when the flag is enabled', () => {
    vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
      isEnabled: () => true,
    })
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [PURCHASED_ITEM],
    })
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    expect(screen.getByText('Guardar un ticket')).toBeInTheDocument()
  })

  it('offers it while there is still shopping to do, not only once the list is done', () => {
    // It used to wait for an empty list, which made it a reward for finishing.
    // The shop it exists for is the one that never went on the list at all.
    vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
      isEnabled: () => true,
    })
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [makeItem({ id: 'i1', purchased: false })],
    })
    render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
    expect(screen.getByText('Guardar un ticket')).toBeInTheDocument()
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

// ---------------------------------------------------------------------------
// Reading a paper. The scan no longer has a screen of its own: it fills the
// close sheet, which is the one place a shop is written down.
// ---------------------------------------------------------------------------

describe('reading a paper into the close sheet', () => {
  const SCAN: ReceiptScanResult = {
    scan_id: 'scan-1',
    store: 'Mercadona',
    // A scan answers with the hour the paper printed and the offset that
    // places it. This is 19:12 UTC, which is the 20th in Madrid either way.
    receipt_date: '2026-07-20T21:12:00+02:00',
    receipt_total: 3.5,
    matched: [
      {
        index: 0,
        receipt_name: 'LECHE HACENDADO',
        item_id: 'i-leche',
        item_name: 'Leche',
        price_type: 'UNIT',
        unit_price: 1.5,
        quantity: null,
        line_total: 1.5,
        confirmed: false,
      },
    ],
    unmatched: [
      {
        index: 1,
        receipt_name: '2 PAN DE PUEBLO',
        price_type: 'UNIT',
        unit_price: 2,
        quantity: null,
        line_total: 2,
      },
    ],
  }

  beforeEach(() => {
    // jsdom has no object URLs, and the photograph is one: the screen mints it
    // over the file that was picked, since nothing stores the image.
    URL.createObjectURL = vi.fn(() => 'blob:paper')
    URL.revokeObjectURL = vi.fn()
    vi.mocked(receiptAi.parseReceiptWithAi).mockResolvedValue({
      store: 'Mercadona',
      receipt_date: '2026-07-20T21:12:00+02:00',
      receipt_total: 3.5,
      lines: [],
    })
    vi.mocked(api.submitParsedReceipt).mockResolvedValue(SCAN)
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [
        makeItem({ id: 'i-leche', name: 'Leche' }),
        makeItem({ id: 'i-pan', name: 'Pan' }),
      ],
    })
  })

  function pickPaper(container: HTMLElement, name: string) {
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], name, { type: 'image/jpeg' })] },
    })
  }

  /** Reads a paper and waits for the sheet it fills. */
  async function readPaper() {
    const { container } = render(
      <ListScreen listId="l1" listName="Test" listOwnerId="u1" />,
    )
    pickPaper(container, 'r.jpg')
    await screen.findByText('LECHE HACENDADO')
    return container
  }

  /** Answers the printed line the matcher could not place with the one row
   *  still free. */
  /** The close sheet. The list behind it names the same products, so a row
   *  has to be asked for inside the sheet. */
  function sheet() {
    return within(document.querySelector('.cts') as HTMLElement)
  }

  /** Says yes to the milk the matcher guessed. Its own item leads the sheet
   *  and arrives picked, so confirming is one tap. */
  async function confirmLeche() {
    await userEvent.click(sheet().getByRole('button', { name: /Leche/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))
  }

  /** What the app believes a printed line was, as the row draws it. */
  function guessOf(name: string) {
    return sheet()
      .getByLabelText(name)
      .closest('.cts__row')
      ?.querySelector('.cts__guess')
  }

  async function resolvePan() {
    await userEvent.click(
      screen.getByRole('button', { name: 'Asignar 2 PAN DE PUEBLO' }),
    )
    await userEvent.click(screen.getByRole('radio'))
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))
  }

  async function save() {
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar compra' }),
    )
    await waitFor(() => expect(api.closePurchase).toHaveBeenCalled())
    return vi.mocked(api.closePurchase).mock.calls[0][2]
  }

  it('lays what the paper printed over the sheet', async () => {
    await readPaper()

    // The paper leads on every row, and what the app believes sits under it.
    expect(screen.getByText('LECHE HACENDADO')).toBeInTheDocument()
    expect(screen.getByText('2 PAN DE PUEBLO')).toBeInTheDocument()
    expect(screen.getByText('Asignar producto')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mercadona' }),
    ).toBeInTheDocument()
  })

  it('keeps the day the paper printed, not the day it was read', async () => {
    await readPaper()

    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-07-20')
  })

  it('mounts a fresh sheet when the paper is read again', async () => {
    // Reading again replaces every row, and the sheet seeds its rows once, so
    // the second scan can only land as a new sheet.
    const container = await readPaper()
    await userEvent.click(sheet().getByLabelText('Leche'))
    expect(sheet().getByLabelText('Leche')).not.toBeChecked()

    vi.mocked(api.submitParsedReceipt).mockResolvedValue({
      ...SCAN,
      scan_id: 'scan-2',
    })
    pickPaper(container, 'r2.jpg')

    await waitFor(() => expect(sheet().getByLabelText('Leche')).toBeChecked())
  })

  it('discards the paper without starting the sheet again', async () => {
    // The opposite promise: what was typed survives, so this one happens in
    // place. A remount here would throw away the ticks and the prices.
    await readPaper()
    await userEvent.click(sheet().getByLabelText('Leche'))

    await userEvent.click(
      screen.getByRole('button', { name: 'Qué hacer con el ticket' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Descartar el ticket' }),
    )

    expect(screen.queryByText('LECHE HACENDADO')).not.toBeInTheDocument()
    expect(sheet().getByLabelText('Leche')).not.toBeChecked()
  })

  it('offers both ways to read the paper again', async () => {
    await readPaper()

    await userEvent.click(
      screen.getByRole('button', { name: 'Qué hacer con el ticket' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Volver a leerlo' }),
    )

    expect(
      screen.getByRole('button', { name: /Tomar foto/ }),
    ).toBeInTheDocument()
  })

  it('asks which product a printed line was, offering the rows still free', async () => {
    await readPaper()

    await userEvent.click(
      screen.getByRole('button', { name: 'Asignar 2 PAN DE PUEBLO' }),
    )

    expect(
      screen.getByRole('heading', { name: 'Asignar producto' }),
    ).toBeInTheDocument()
    // The milk row is spoken for by the line above it, so only the bread is
    // offered.
    expect(screen.getByText('Pendientes de asignar · 1')).toBeInTheDocument()
    expect(screen.getByRole('radio')).toBeInTheDocument()
  })

  // The matcher placed this line by score, so the row is the app's guess and
  // nothing has confirmed it. The sheet that settles a guess is the same one
  // that fills a blank — adjusting it instead would leave the dashed underline
  // on forever and teach the shop nothing.
  it('asks which product a guessed line was, rather than adjusting it', async () => {
    await readPaper()

    await userEvent.click(sheet().getByRole('button', { name: /Leche/ }))

    expect(
      screen.getByRole('heading', { name: 'Asignar producto' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ajustar producto')).not.toBeInTheDocument()
  })

  it('makes a confirmed guess solid', async () => {
    await readPaper()

    await confirmLeche()

    expect(guessOf('Leche')?.className).not.toContain('cts__guess--ask')
  })

  // The whole reason the scan says whether a match was confirmed: the string
  // the household confirmed has to arrive resolved on the next ticket.
  it('teaches the shop the printed line a guess was confirmed for', async () => {
    await readPaper()

    await confirmLeche()
    const payload = await save()

    expect(payload.mappings).toEqual([
      { receipt_name: 'LECHE HACENDADO', item_name: 'Leche', item_brand: null },
    ])
  })

  it('adjusts a row whose match somebody had already confirmed', async () => {
    vi.mocked(api.submitParsedReceipt).mockResolvedValue({
      ...SCAN,
      matched: [{ ...SCAN.matched[0], confirmed: true }],
    })
    await readPaper()

    await userEvent.click(sheet().getByRole('button', { name: /Leche/ }))

    expect(screen.getByText('Ajustar producto')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Asignar producto' }),
    ).not.toBeInTheDocument()
  })

  // A guess names a product, so there is something to save and the box stays
  // live. That is a different question from the one the chevron asks.
  it('leaves a guessed row tickable', async () => {
    await readPaper()

    expect(sheet().getByLabelText('Leche')).toBeEnabled()
    expect(sheet().getByLabelText('Leche')).toBeChecked()
  })

  // Answered is answered, however it was answered. A line named with a
  // product nobody had on the list still has an amount that may need
  // correcting, and the chevron is the only way to it.
  it('adjusts a line that was answered with a product of its own', async () => {
    await readPaper()

    await userEvent.click(
      screen.getByRole('button', { name: 'Asignar 2 PAN DE PUEBLO' }),
    )
    const field = screen.getByLabelText('Si no estaba en la lista')
    await userEvent.clear(field)
    await userEvent.type(field, 'Chicles')
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }))

    await userEvent.click(sheet().getByRole('button', { name: /Chicles/ }))

    expect(screen.getByLabelText('Producto')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Asignar producto' }),
    ).not.toBeInTheDocument()
  })

  it('takes the claimed row off the ticket', async () => {
    // One product cannot sit on two rows of one ticket: the payload would
    // send it twice and the sheet would show it twice.
    await readPaper()

    await resolvePan()

    expect(sheet().getAllByLabelText('Pan')).toHaveLength(1)
    expect(sheet().getByLabelText('Pan')).toBeChecked()
    // The row that was waiting is gone, not merely unticked. Left behind it
    // would read as a second bread nobody bought, and one tick would file it.
    expect(sheet().getByText('2 de 2')).toBeInTheDocument()

    // And the answer joins the item that was waiting rather than creating a
    // second product with the same name.
    const payload = await save()
    expect(payload.lines.map((l) => l.item_id)).toEqual(['i-leche', 'i-pan'])
    expect(payload.new_items).toEqual([])
  })

  it('teaches the shop what the printed line was', async () => {
    await readPaper()

    await resolvePan()
    const payload = await save()

    expect(payload.scan_id).toBe('scan-1')
    // The hour the paper printed, kept through the offset the scan answers
    // with. Collapsed to noon, a shop would lose its place in the day.
    expect(payload.purchased_at).toBe('2026-07-20T19:12:00')
    // As printed, leading number and all. The server keys these its own way,
    // and spelling it twice is how the two spellings drift apart.
    expect(payload.mappings).toEqual([
      { receipt_name: '2 PAN DE PUEBLO', item_name: 'Pan', item_brand: null },
    ])
  })

  it('names no scan and teaches nothing once the paper is discarded', async () => {
    await readPaper()
    await resolvePan()

    await userEvent.click(
      screen.getByRole('button', { name: 'Qué hacer con el ticket' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Descartar el ticket' }),
    )
    const payload = await save()

    expect(payload.scan_id).toBeUndefined()
    expect(payload.mappings).toBeUndefined()
  })
})

describe('the camera on the close sheet', () => {
  const inCart = makeItem({
    id: 'i1',
    name: 'Leche',
    purchased: true,
    purchased_at: TODAY,
    purchase_id: 'open-trip',
    purchase_ends_at: new Date(Date.now() + 3_600_000)
      .toISOString()
      .slice(0, 19),
  })

  async function openSheet(scanning: boolean) {
    vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
      isEnabled: () => scanning,
    })
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [inCart],
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
    await userEvent.click(screen.getByRole('button', { name: /Cerrar compra/ }))
  }

  it('offers to read a paper when the household has scanning', async () => {
    await openSheet(true)

    expect(
      screen.getByRole('button', { name: 'Escanear ticket' }),
    ).toBeEnabled()
  })

  it('does not offer it when the household has not', async () => {
    await openSheet(false)

    expect(
      screen.getByRole('button', { name: 'Escanear ticket' }),
    ).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// The emoji — moved off the dashboard panel, which is now only a way in.
// ---------------------------------------------------------------------------

describe('the list emoji', () => {
  const openEmojiPicker = () => {
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    fireEvent.click(screen.getByRole('button', { name: /^emoji$/i }))
  }

  it('shows the new emoji before the API answers', async () => {
    vi.mocked(api.updateList).mockImplementation(
      () => new Promise(() => {}) as never,
    )
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listEmoji="🛒"
        listOwnerId="u1"
      />,
    )
    openEmojiPicker()
    fireEvent.click(screen.getByRole('button', { name: '🍎' }))

    await waitFor(() =>
      expect(screen.getByRole('heading').textContent).toContain('🍎'),
    )
  })

  it('tells the route once the write lands, as the rename does', async () => {
    const onEmojiChanged = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listEmoji="🛒"
        listOwnerId="u1"
        onEmojiChanged={onEmojiChanged}
      />,
    )
    openEmojiPicker()
    fireEvent.click(screen.getByRole('button', { name: '🍎' }))

    await waitFor(() => expect(onEmojiChanged).toHaveBeenCalledWith('🍎'))
  })

  it('puts the old emoji back and says so when the write fails', async () => {
    vi.mocked(api.updateList).mockRejectedValue(new Error('nope'))
    const onEmojiChanged = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listEmoji="🛒"
        listOwnerId="u1"
        onEmojiChanged={onEmojiChanged}
      />,
    )
    openEmojiPicker()
    fireEvent.click(screen.getByRole('button', { name: '🍎' }))

    await waitFor(() =>
      expect(screen.getByText(/no se pudo cambiar el emoji/i)).toBeVisible(),
    )
    expect(screen.getByRole('heading').textContent).toContain('🛒')
    // A failed write must not tell the route the emoji changed.
    expect(onEmojiChanged).not.toHaveBeenCalled()
  })

  it('a member who does not own the list may still set it — identity is shared', () => {
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listEmoji="🛒"
        listOwnerId="someone-else"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    expect(screen.getByRole('button', { name: /^emoji$/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Marking a default and deleting — the dashboard's ⋯ used to reach these too,
// and its tests were the only ones covering ListScreen's handlers. The panel
// lost the second door; these paths did not, so the coverage follows them here
// rather than going with the door.
// ---------------------------------------------------------------------------

describe('the list itself', () => {
  const openMenu = () =>
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))

  it('marks the list as the default one', async () => {
    const onSetDefault = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        onSetDefault={onSetDefault}
      />,
    )
    openMenu()
    fireEvent.click(
      screen.getByRole('button', { name: /marcar como predeterminada/i }),
    )

    await waitFor(() =>
      expect(api.setDefaultList).toHaveBeenCalledWith(expect.anything(), 'l1'),
    )
    expect(onSetDefault).toHaveBeenCalledWith(true)
  })

  it('takes the star back and says so when that write fails', async () => {
    vi.mocked(api.setDefaultList).mockRejectedValue(new Error('nope'))
    const onSetDefault = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        onSetDefault={onSetDefault}
      />,
    )
    openMenu()
    fireEvent.click(
      screen.getByRole('button', { name: /marcar como predeterminada/i }),
    )

    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo marcar como predeterminada/i),
      ).toBeVisible(),
    )
    // The optimistic flag is reverted, so the menu offers the action again.
    openMenu()
    expect(
      screen.getByRole('button', { name: /marcar como predeterminada/i }),
    ).toBeInTheDocument()
    expect(onSetDefault).not.toHaveBeenCalled()
  })

  it('deletes the list and leaves it, once the warning is confirmed', async () => {
    const onBack = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        onBack={onBack}
      />,
    )
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar lista/i }))

    await waitFor(() =>
      expect(api.deleteList).toHaveBeenCalledWith(expect.anything(), 'l1'),
    )
    expect(onBack).toHaveBeenCalled()
    // And the sheet goes with it — leaving it mounted over a list that no
    // longer exists would pass every other assertion here.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays put when the delete fails — leaving would say it worked', async () => {
    vi.mocked(api.deleteList).mockRejectedValue(new Error('nope'))
    const onBack = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        onBack={onBack}
      />,
    )
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar lista/i }))

    await waitFor(() =>
      expect(screen.getByText(/no se pudo eliminar la lista/i)).toBeVisible(),
    )
    expect(onBack).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// With no connection.
//
// All four handlers open with the same `if (isOffline)` guard and none of them
// was exercised: jsdom reports navigator.onLine as true, so every test
// above takes the online leg. Varying the environment rather than mocking the
// hook keeps useIsOffline itself in the path — the guard and the thing it
// reads are tested together, which is the point of the exercise.
// ---------------------------------------------------------------------------

describe('with no connection', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
  })

  afterEach(() => {
    // Delete rather than redefine: replacing it with a getter that returns a
    // hardcoded `true` would leave navigator.onLine shadowed for the rest of
    // the file. Removing the own property uncovers jsdom's real accessor
    // again, so nothing here depends on this block running last.
    delete (navigator as { onLine?: boolean }).onLine
    // Assert it rather than trust the comment. jsdom installs onLine on
    // Navigator.prototype, so deleting the own property uncovers it — but if a
    // future jsdom made it an instance property, this delete would leave it
    // undefined and every later test in the file would silently run offline.
    expect(navigator.onLine).toBe(true)
  })

  const openMenu = () =>
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))

  it('will not rename the list, and says why', async () => {
    const onRename = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        onRename={onRename}
      />,
    )
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Nombre de la lista' }),
      { target: { value: 'Mercadillo' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(screen.getByText(/no disponible sin conexión/i)).toBeVisible(),
    )
    expect(api.updateList).not.toHaveBeenCalled()
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('heading').textContent).toContain('Mercado')
  })

  it('will not change the emoji, and says why', async () => {
    const onEmojiChanged = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listEmoji="🛒"
        listOwnerId="u1"
        onEmojiChanged={onEmojiChanged}
      />,
    )
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /^emoji$/i }))
    fireEvent.click(screen.getByRole('button', { name: '🍎' }))

    await waitFor(() =>
      expect(screen.getByText(/no disponible sin conexión/i)).toBeVisible(),
    )
    expect(api.updateList).not.toHaveBeenCalled()
    expect(onEmojiChanged).not.toHaveBeenCalled()
    // The optimistic paint must not happen either — showing the new glyph and
    // then a "not available" toast would say both things at once.
    expect(screen.getByRole('heading').textContent).toContain('🛒')
  })

  it('will not mark a default, and says why', async () => {
    const onSetDefault = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        onSetDefault={onSetDefault}
      />,
    )
    openMenu()
    fireEvent.click(
      screen.getByRole('button', { name: /marcar como predeterminada/i }),
    )

    await waitFor(() =>
      expect(screen.getByText(/no disponible sin conexión/i)).toBeVisible(),
    )
    expect(api.setDefaultList).not.toHaveBeenCalled()
    expect(onSetDefault).not.toHaveBeenCalled()
  })

  it('will not delete the list, and says why', async () => {
    const onBack = vi.fn()
    render(
      <ListScreen
        listId="l1"
        listName="Mercado"
        listOwnerId="u1"
        onBack={onBack}
      />,
    )
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar lista/i }))

    await waitFor(() =>
      expect(screen.getByText(/no disponible sin conexión/i)).toBeVisible(),
    )
    expect(api.deleteList).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('closing a trip', () => {
  // In the cart: bought, on a trip that has not torn off yet.
  const inCart = () =>
    makeItem({
      id: 'i1',
      name: 'Leche',
      purchased: true,
      purchased_at: TODAY,
      purchase_id: 'open-trip',
      purchase_ends_at: new Date(Date.now() + 3_600_000)
        .toISOString()
        .slice(0, 19),
    })

  function renderWithCart() {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [inCart()],
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
  }

  const openSheet = async () =>
    userEvent.click(screen.getByRole('button', { name: /Cerrar compra/ }))

  it('opens the close sheet from the cart stamp', async () => {
    renderWithCart()

    await openSheet()

    expect(screen.getByText('Total de lo que has puesto')).toBeInTheDocument()
  })

  it('sends the close and puts the sheet away', async () => {
    vi.mocked(api.closePurchase).mockResolvedValue({
      id: 'p1',
      list_id: 'l1',
      opened_at: TODAY,
      tears_off_at: TODAY,
      closed_at: TODAY,
      store: 'Lidl',
      total: null,
    })
    renderWithCart()

    await openSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Lidl')
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar compra' }),
    )

    await waitFor(() =>
      expect(api.closePurchase).toHaveBeenCalledWith(
        expect.anything(),
        'l1',
        expect.objectContaining({ store: 'Lidl' }),
      ),
    )
    expect(
      screen.queryByText('Total de lo que has puesto'),
    ).not.toBeInTheDocument()
  })

  it('dates the sheet from the shop, not from when it was opened', async () => {
    // The whole shop happened offline, so no trip exists to read: the taps are
    // queued too. Reading the clock would date a 23:40 shop as the next day if
    // the sheet is opened after midnight, and the close would then ask the
    // server for a day the lines are not in.
    // A full day back, so the answer cannot coincide with today's date and
    // pass while the fallback does nothing.
    const lastNight = new Date(Date.now() - 26 * 3_600_000)
      .toISOString()
      .slice(0, 19)
    vi.mocked(api.getPurchases).mockResolvedValue([])
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [
        makeItem({
          id: 'i1',
          name: 'Leche',
          purchased: true,
          purchased_at: lastNight,
          purchase_id: null,
          purchase_ends_at: null,
        }),
      ],
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    await openSheet()

    expect(screen.getByLabelText('Fecha')).toHaveValue(madridDay(lastNight))
    expect(screen.getByLabelText('Fecha')).not.toHaveValue(
      madridDay(new Date().toISOString().slice(0, 19)),
    )
  })

  it('ignores the shops this list did months ago', async () => {
    // The items endpoint returns the whole history — every filed ticket's
    // lines are still in it. Scanning all of them dates tonight's shop from
    // the oldest one on record, which the server then clamps to a third day
    // again and refuses.
    const lastNight = new Date(Date.now() - 26 * 3_600_000)
      .toISOString()
      .slice(0, 19)
    const monthsAgo = new Date(Date.now() - 90 * 86_400_000)
      .toISOString()
      .slice(0, 19)
    vi.mocked(api.getPurchases).mockResolvedValue([])
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items: [
        // Settled long ago: still returned, still carries its purchased_at.
        makeItem({
          id: 'old',
          name: 'Arroz',
          purchased: true,
          purchased_at: monthsAgo,
          purchase_id: 'p-old',
          purchase_ends_at: monthsAgo,
        }),
        // Tonight, tapped with no signal, so no trip exists for it yet.
        makeItem({
          id: 'i1',
          name: 'Leche',
          purchased: true,
          purchased_at: lastNight,
          purchase_id: null,
          purchase_ends_at: null,
        }),
      ],
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)

    await openSheet()

    expect(screen.getByLabelText('Fecha')).toHaveValue(madridDay(lastNight))
    expect(screen.getByLabelText('Fecha')).not.toHaveValue(madridDay(monthsAgo))
  })

  it('names the open trip, so a close replayed after midnight still lands', async () => {
    // A null purchase_id means "whichever trip is open when the server reads
    // this", and the queue exists so the server reads it later. Reconnect
    // after the cart has torn off and that resolves to nothing, or to the
    // wrong trip, and the drain throws the whole shop away.
    vi.mocked(api.getPurchases).mockResolvedValue([
      {
        id: 'open-trip',
        list_id: 'l1',
        opened_at: TODAY,
        tears_off_at: new Date(Date.now() + 3_600_000)
          .toISOString()
          .slice(0, 19),
        closed_at: null,
        store: null,
        total: null,
      },
    ])
    vi.mocked(api.closePurchase).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    renderWithCart()

    await openSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Lidl')
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar compra' }),
    )

    await waitFor(() =>
      expect(offlineQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ purchase_id: 'open-trip' }),
        }),
      ),
    )
  })

  it('keeps a close the network refused, rather than losing the shop', async () => {
    vi.mocked(api.closePurchase).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    renderWithCart()

    await openSheet()
    await userEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Lidl')
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar compra' }),
    )

    await waitFor(() =>
      expect(offlineQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ listId: 'l1', type: 'closePurchase' }),
      ),
    )
  })
})

describe('writing down a trip that already tore off', () => {
  const TORN_OFF_ENDS = new Date(Date.now() - 3_600_000)
    .toISOString()
    .slice(0, 19)

  /** Yesterday's shop: settled, but nobody ever said what it was. */
  const unfiled = () =>
    makeItem({
      id: 'old',
      name: 'Leche',
      purchased: true,
      purchased_at: YESTERDAY,
      purchase_id: 'p1',
      purchase_ends_at: TORN_OFF_ENDS,
      price: 1.19,
    })

  const openTrip = () =>
    makeItem({
      id: 'today',
      name: 'Pan',
      purchased: true,
      purchased_at: TODAY,
      purchase_id: 'p2',
      purchase_ends_at: new Date(Date.now() + 3_600_000)
        .toISOString()
        .slice(0, 19),
    })

  function renderWithUnfiledTicket(items = [unfiled()]) {
    vi.mocked(api.getPurchases).mockResolvedValue([
      {
        id: 'p1',
        list_id: 'l1',
        opened_at: YESTERDAY,
        tears_off_at: TORN_OFF_ENDS,
        closed_at: null,
        store: null,
        total: null,
      },
    ])
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({
      ...emptyHookResult,
      items,
    })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
  }

  it('opens the sheet on the trip’s own lines, not on today’s cart', async () => {
    vi.mocked(api.closePurchase).mockResolvedValue({
      id: 'p1',
      list_id: 'l1',
      opened_at: YESTERDAY,
      tears_off_at: TORN_OFF_ENDS,
      closed_at: TODAY,
      store: 'Lidl',
      total: null,
    })
    renderWithUnfiledTicket([unfiled(), openTrip()])

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Cerrar compra/ }),
      ).toBeInTheDocument(),
    )
    // Two stamps would be ambiguous; the cart's rubric is the other one.
    await userEvent.click(
      screen.getAllByRole('button', { name: /Cerrar compra/ })[1],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Lidl')
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar compra' }),
    )

    // The whole point: the sheet carried p1's line and named p1, so the
    // server can find it in that trip's cart. Sending today's Pan instead
    // would come back 400 and file nothing.
    await waitFor(() =>
      expect(api.closePurchase).toHaveBeenCalledWith(
        expect.anything(),
        'l1',
        expect.objectContaining({
          purchase_id: 'p1',
          lines: [expect.objectContaining({ item_id: 'old' })],
        }),
      ),
    )
  })

  it('keeps the sheet open when the close is refused', async () => {
    vi.mocked(api.closePurchase).mockRejectedValue(
      new api.ApiError(400, 'Some items are not in the trip being closed'),
    )
    renderWithUnfiledTicket()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Cerrar compra/ }),
      ).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: /Cerrar compra/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Elegir tienda' }))
    await userEvent.type(screen.getByLabelText('Tienda'), 'Lidl')
    await userEvent.click(
      screen.getByRole('button', { name: 'Guardar compra' }),
    )

    // Everything typed into it is seeded once and lives in its own state, so
    // unmounting here would throw the shop away over a failure the household
    // cannot act on.
    await waitFor(() => expect(api.closePurchase).toHaveBeenCalled())
    expect(screen.getByText('Total de lo que has puesto')).toBeInTheDocument()
  })
})
