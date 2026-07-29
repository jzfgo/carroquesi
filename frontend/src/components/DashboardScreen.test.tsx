import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import * as reactRouter from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as FeatureFlagsContext from '../contexts/FeatureFlagsContext'
import * as useApplePlatformModule from '../hooks/useApplePlatform'
import * as usePWAInstallModule from '../hooks/usePWAInstall'
import * as api from '../lib/api'
import { DashboardScreen } from './DashboardScreen'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: vi.fn(),
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
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: vi.fn().mockReturnValue(vi.fn()),
  }
})
vi.mock('../hooks/usePWAInstall')
vi.mock('../hooks/useApplePlatform')

const mockGetToken = vi.fn(async () => 'token')
const mockSignOut = vi.fn(async () => undefined)
let mockNavigate: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.removeItem('cqs_dashboard_cache_u1')
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true,
  })
  mockNavigate = vi.fn()
  vi.mocked(reactRouter.useNavigate).mockReturnValue(mockNavigate as never)
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
    signOut: mockSignOut,
    loading: false,
    isWaitlisted: false,
  })
  vi.mocked(api.createList).mockResolvedValue({
    id: 'l-new',
    name: 'Nueva',
    emoji: '🍎',
    owner_id: 'u1',
    created_at: '',
    updated_at: '',
    item_count: 0,
    purchased_count: 0,
    is_default: false,
  } as never)
  vi.mocked(FeatureFlagsContext.useFeatureFlags).mockReturnValue({
    isEnabled: () => false,
  })
  vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
    isInstallable: false,
    isInstalled: false,
    isIOS: false,
    promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })
  vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(false)
  vi.mocked(api.openShortcutImport).mockImplementation(() => {})
  // Steady state: the user already has a key, so issuance is a no-op that returns
  // no plaintext. Tests exercising first-time issuance override this per-case.
  vi.mocked(api.issueApiKey).mockResolvedValue({
    key: null,
    created: false,
  } as never)
  vi.mocked(api.regenerateApiKey).mockResolvedValue({
    key: 'cqs_test-key',
    regenerated_at: '',
  } as never)
})

const twoLists = [
  {
    id: 'l1',
    name: 'Mercado',
    emoji: '🛒',
    owner_id: 'u1',
    created_at: '',
    updated_at: '',
    item_count: 8,
    purchased_count: 3,
    is_default: true,
  },
  {
    id: 'l2',
    name: 'Costco',
    emoji: '🏠',
    owner_id: 'u1',
    created_at: '',
    updated_at: '',
    item_count: 2,
    purchased_count: 0,
    is_default: false,
  },
]

describe('DashboardScreen', () => {
  it('shows loading spinner while fetching', () => {
    vi.mocked(api.getLists).mockReturnValue(new Promise(() => {}))
    render(<DashboardScreen />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows list cards after successful fetch', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(screen.getByText('Costco')).toBeInTheDocument()
  })

  it('shows progress subtitle on list cards', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByText('3 comprados')).toBeInTheDocument(),
    )
  })

  it('names the panel and counts it, which no single row can do', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    const { container } = render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Tus listas')).toBeVisible())
    expect(
      container.querySelector('.dashboard-screen__panel-count'),
    ).toHaveTextContent(String(twoLists.length))
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(api.getLists).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /reintentar/i }),
      ).toBeInTheDocument(),
    )
  })

  it('shows create-first-list prompt when no lists', async () => {
    vi.mocked(api.getLists).mockResolvedValue([] as never)
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByText(/primera lista/i)).toBeInTheDocument(),
    )
  })

  it('navigates to /lists/:id when a card is tapped', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByText('Mercado'))
    expect(mockNavigate).toHaveBeenCalledWith('/lists/l1')
  })

  it('opens avatar menu on avatar click and calls signOut via menu item', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})

// The panel is a way in and nothing else: the ⋯ and the emoji button are gone,
// so renaming, deleting, marking a default and choosing an emoji are exercised
// where they now live — see ListScreen.test.tsx and ListActionSheet.test.tsx.
describe('DashboardScreen — avatar menu and install banner', () => {
  it('avatar menu closes when clicking outside', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('avatar menu closes when Escape is pressed', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('avatar menu shows "Instalar app" when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(
      screen.getByRole('menuitem', { name: /instalar app/i }),
    ).toBeInTheDocument()
  })

  it('avatar menu hides "Instalar app" when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(
      screen.queryByRole('menuitem', { name: /instalar app/i }),
    ).not.toBeInTheDocument()
  })

  it('clicking "Instalar app" calls promptInstall and closes menu', async () => {
    const mockPromptInstall = vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined)
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: mockPromptInstall,
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /instalar app/i }))
    expect(mockPromptInstall).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // The row is a button that opens a list, and aria-roledescription replaces
  // the role announcement rather than adding to it — so any value here costs
  // it its "botón". dnd-kit sets one by default; this pins that it does not
  // reach the button. Nothing else in the suite can see an aria attribute
  // that is merely wrong rather than missing.
  it('does not let the drag attributes rename what the row is', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    const row = await screen.findByRole('button', { name: /^Mercado/ })
    expect(row).not.toHaveAttribute('aria-roledescription')
  })

  it('renders InstallBanner when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('does not render InstallBanner when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('avatar menu hides "Instalar app" when already installed', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: true,
      isIOS: false,
      promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(
      screen.queryByRole('menuitem', { name: /instalar app/i }),
    ).not.toBeInTheDocument()
  })

  it('opens feedback sheet from avatar menu with the user email prefilled', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: /enviar feedback/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com')
  })

  it('submits feedback and shows success toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.submitFeedback).mockResolvedValue({
      id: 'fb-1',
      created_at: '2026-05-31T10:00:00',
    } as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }))
    fireEvent.change(screen.getByLabelText(/mensaje/i), {
      target: { value: 'Great app' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }))

    await waitFor(() =>
      expect(api.submitFeedback).toHaveBeenCalledWith(mockGetToken, {
        message: 'Great app',
        email: 'alice@example.com',
        source: 'manual',
      }),
    )
    expect(
      screen.queryByRole('dialog', { name: /enviar feedback/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/feedback enviado/i)).toBeInTheDocument()
  })

  it('keeps feedback sheet open and shows failure toast when submit fails', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.submitFeedback).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))

    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }))
    fireEvent.change(screen.getByLabelText(/mensaje/i), {
      target: { value: 'Great app' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }))

    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo enviar el feedback/i),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('dialog', { name: /enviar feedback/i }),
    ).toBeInTheDocument()
  })

  it('avatar menu shows "Añadir atajo a Siri" on Apple platforms', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(
      screen.getByRole('menuitem', { name: /añadir atajo a siri/i }),
    ).toBeInTheDocument()
  })

  it('avatar menu hides "Añadir atajo a Siri" on non-Apple platforms', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(
      screen.queryByRole('menuitem', { name: /añadir atajo a siri/i }),
    ).not.toBeInTheDocument()
  })

  // Opens the Siri sheet via the single menu item and waits for it to appear.
  async function openSiriSheet() {
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(
      screen.getByRole('menuitem', { name: /añadir atajo a siri/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: /atajo de siri/i }),
      ).toBeInTheDocument(),
    )
  }

  it('there is a single Siri menu item — no separate "Regenerar clave" entry', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(
      screen.getByRole('menuitem', { name: /añadir atajo a siri/i }),
    ).toBeInTheDocument()
    // regeneration now lives inside the sheet, not the avatar menu
    expect(
      screen.queryByRole('menuitem', { name: /regenerar clave/i }),
    ).not.toBeInTheDocument()
  })

  it('Siri sheet names the default list as the destination', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    // "Mercado" is the flagged default in twoLists.
    expect(screen.getByText(/se añadirán a/i)).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog', { name: /atajo de siri/i })).getByText(
        'Mercado',
      ),
    ).toBeInTheDocument()
  })

  it('blocks Siri setup and nudges when the user has no default list', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    const noDefault = twoLists.map((l) => ({ ...l, is_default: false }))
    vi.mocked(api.getLists).mockResolvedValue(noDefault as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(
      screen.getByRole('menuitem', { name: /añadir atajo a siri/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByText(/marca una lista como predeterminada/i),
      ).toBeInTheDocument(),
    )
    expect(api.issueApiKey).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('dialog', { name: /atajo de siri/i }),
    ).not.toBeInTheDocument()
  })

  it('first issuance: opens the sheet showing the key, without auto-importing or rotating', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockResolvedValue({
      key: 'cqs_test-key',
      created: true,
    } as never)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    expect(api.issueApiKey).toHaveBeenCalledOnce()
    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(screen.getByText('cqs_test-key')).toBeInTheDocument()
    // import is deferred to an explicit tap, and never auto-fires on open
    expect(api.openShortcutImport).not.toHaveBeenCalled()
  })

  it('returning user (key already exists): opens the sheet with no key shown, steering to regenerate', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    // default issueApiKey mock returns { key: null, created: false }
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    expect(api.issueApiKey).toHaveBeenCalledOnce()
    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(api.openShortcutImport).not.toHaveBeenCalled()
    // no key is displayed (it's unrecoverable) — the masked field + hint show instead
    expect(screen.queryByText('cqs_test-key')).not.toBeInTheDocument()
    expect(screen.getByText(/tu clave está oculta/i)).toBeInTheDocument()
  })

  it('tapping "Añadir a Shortcuts" launches the import', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    fireEvent.click(screen.getByRole('button', { name: /añadir a shortcuts/i }))
    expect(api.openShortcutImport).toHaveBeenCalledOnce()
  })

  it('shows a generic error toast when issuing the key fails, and does not open the sheet', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockRejectedValue(new Error('boom'))
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(
      screen.getByRole('menuitem', { name: /añadir atajo a siri/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByText(
          'No se pudo preparar el atajo de Siri. Inténtalo de nuevo.',
        ),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('dialog', { name: /atajo de siri/i }),
    ).not.toBeInTheDocument()
    expect(api.openShortcutImport).not.toHaveBeenCalled()
  })

  it('regenerate: opens a follow-up confirm sheet; confirming rotates the key', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockResolvedValue({
      key: 'cqs_old-key',
      created: true,
    } as never)
    vi.mocked(api.regenerateApiKey).mockResolvedValue({
      key: 'cqs_new-key',
      regenerated_at: '',
    } as never)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    expect(screen.getByText('cqs_old-key')).toBeInTheDocument()

    // tapping opens a separate confirm sheet — no rotation yet
    fireEvent.click(screen.getByRole('button', { name: /regenerar clave/i }))
    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: /regenerar clave/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/se invalidará tu clave actual/i),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /sí, regenerar/i }))
    await waitFor(() => expect(api.regenerateApiKey).toHaveBeenCalledOnce())
    // the base sheet's key field updates and the confirm sheet closes
    await waitFor(() =>
      expect(screen.getByText('cqs_new-key')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('dialog', { name: /regenerar clave/i }),
    ).not.toBeInTheDocument()
    expect(api.openShortcutImport).not.toHaveBeenCalled()
  })

  it('regenerate: cancelling the follow-up confirm sheet does not rotate the key', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockResolvedValue({
      key: 'cqs_old-key',
      created: true,
    } as never)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    fireEvent.click(screen.getByRole('button', { name: /regenerar clave/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(screen.getByText('cqs_old-key')).toBeInTheDocument()
    // the confirm sheet is gone; the base sheet remains
    expect(
      screen.queryByRole('dialog', { name: /regenerar clave/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: /atajo de siri/i }),
    ).toBeInTheDocument()
  })

  it('shows an error toast when regenerating fails, keeping the sheet open', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockResolvedValue({
      key: 'cqs_old-key',
      created: true,
    } as never)
    vi.mocked(api.regenerateApiKey).mockRejectedValue(new Error('boom'))
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    fireEvent.click(screen.getByRole('button', { name: /regenerar clave/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, regenerar/i }))
    await waitFor(() =>
      expect(
        screen.getByText('No se pudo regenerar la clave. Inténtalo de nuevo.'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('dialog', { name: /atajo de siri/i }),
    ).toBeInTheDocument()
  })

  it('dismissing the sheet hides it', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(
      screen.queryByRole('dialog', { name: /atajo de siri/i }),
    ).not.toBeInTheDocument()
  })

  it('copying the key writes it to the clipboard and toasts, without leaking it into any error message', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockResolvedValue({
      key: 'cqs_test-key',
      created: true,
    } as never)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    await openSiriSheet()
    fireEvent.click(screen.getByRole('button', { name: /copiar clave/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('cqs_test-key'))
    expect(screen.getByText('Clave copiada')).toBeInTheDocument()
  })
})

describe('DashboardScreen — offline', () => {
  it('shows cached lists on network error instead of error state', async () => {
    const cached = [twoLists[0]]
    localStorage.setItem('cqs_dashboard_cache_u1', JSON.stringify(cached))
    vi.mocked(api.getLists).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(
      screen.queryByText('No se pudieron cargar tus listas'),
    ).not.toBeInTheDocument()

    localStorage.removeItem('cqs_dashboard_cache_u1')
  })

  it('shows offline banner when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)

    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByText(/sin conexión/i)).toBeInTheDocument(),
    )
  })

  it('saves fetched lists to cache', async () => {
    localStorage.removeItem('cqs_dashboard_cache_u1')
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())

    const raw = localStorage.getItem('cqs_dashboard_cache_u1')
    expect(raw).not.toBeNull()
    localStorage.removeItem('cqs_dashboard_cache_u1')
  })

  // Losing the connection is an event, not just a property. useIsOffline seeds
  // its state from navigator.onLine at mount and thereafter only moves on the
  // window's online/offline events, so flipping the property alone leaves the
  // component still believing it is online — and the guard under test never
  // fires. Dispatching is also the truer scenario: signal lost mid-session,
  // with the screen already mounted, rather than a reload while offline.
  function goOffline() {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    fireEvent(window, new Event('offline'))
  }

  async function openCreateAndSubmit(name: string) {
    fireEvent.click(screen.getByRole('button', { name: /nueva lista/i }))
    fireEvent.change(await screen.findByPlaceholderText(/nombre/i), {
      target: { value: name },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))
  }

  // The two guards below only mean something next to a passing online case —
  // otherwise a handleCreate broken outright would satisfy them too. Both take
  // navigator.onLine offline the way the banner test above does, and rely on the
  // file's beforeEach redefining it back to true rather than restoring it here.

  it('creates a list and refreshes, with a connection', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    await openCreateAndSubmit('Costco')

    // Both inside the same waitFor, and the refresh pinned to an exact count.
    // createList is called synchronously on the click, so a waitFor that only
    // awaits it resolves before the refresh it triggers has landed — asserting
    // the count outside would be relying on microtask timing rather than
    // testing for it. Exactly 2: the fetch on mount, then this refresh.
    await waitFor(() => {
      expect(api.createList).toHaveBeenCalledWith(mockGetToken, {
        name: 'Costco',
        emoji: expect.any(String),
      })
      expect(api.getLists).toHaveBeenCalledTimes(2)
    })
  })

  it('will not create a list without a connection, and says why', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())

    goOffline()
    await openCreateAndSubmit('Costco')

    await waitFor(() =>
      expect(
        screen.getByText(/no disponible sin conexión/i),
      ).toBeInTheDocument(),
    )
    expect(api.createList).not.toHaveBeenCalled()
    // The toast says to come back with a connection, so there has to be
    // something to come back to. This is the half the guard used to get
    // wrong: it refused the write and discarded the name in the same breath.
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('Costco')
  })

  // The other way a create fails to happen. Offline is refused before the
  // request; this one is refused by the server, and until the `catch` existed
  // it was the only path that said nothing at all — the rejection escaped
  // through `void handleSubmit()` as an unhandled one, the name survived by
  // accident of the early return, and the user was left with a filled-in card
  // and no reason for it.
  it('says so when the server refuses to create the list', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.createList).mockRejectedValue(new Error('boom'))

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())

    await openCreateAndSubmit('Costco')

    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo confirmar si se creó la lista/i),
      ).toBeInTheDocument(),
    )
    // Same promise the offline guard makes: the message is only worth reading
    // if the work it refers to is still on screen.
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('Costco')
    expect(screen.getByRole('button', { name: /crear/i })).toBeEnabled()
  })

  // The half the wording cannot do on its own. A rejection does not mean the
  // write was refused — the response can be lost after the commit — and with
  // no idempotency key on `create_list` and no unique constraint on the name,
  // a user who retries on a false "no" ends up with two identical lists. So
  // the failure path refetches: if the list did land it appears underneath the
  // toast, which is the only way the screen can contradict a message the code
  // has no way to make definite.
  it('refetches after a failed create, in case the write landed anyway', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.createList).mockRejectedValue(new Error('boom'))

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(api.getLists).toHaveBeenCalledTimes(1)

    await openCreateAndSubmit('Costco')

    // Exactly 2: the fetch on mount, then the one the catch asks for. Pinning
    // the count rather than "was called" keeps this from passing on the mount
    // fetch alone.
    await waitFor(() => expect(api.getLists).toHaveBeenCalledTimes(2))
  })

  // The toast must not wait on the refetch. `apiFetch` has no timeout, so on
  // the lost-response case this whole branch is for, the follow-up `getLists`
  // hangs as well — and refetching first would leave the card disabled and
  // silent for as long as the browser takes to give up.
  //
  // Asserting the *order* needs the refetch held open, because once everything
  // settles both orderings look identical: swapping the two lines left all 56
  // tests green before this one existed.
  it('says something before the refetch it cannot time comes back', async () => {
    let releaseRefetch!: (v: unknown) => void
    vi.mocked(api.getLists)
      .mockResolvedValueOnce(twoLists as never)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseRefetch = resolve
        }) as never,
      )
    vi.mocked(api.createList).mockRejectedValue(new Error('boom'))

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())

    await openCreateAndSubmit('Costco')

    // The refetch is still in flight and the message is already on screen.
    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo confirmar si se creó la lista/i),
      ).toBeInTheDocument(),
    )
    expect(api.getLists).toHaveBeenCalledTimes(2)

    // Awaited, not fired and forgotten. Releasing without waiting lets the
    // resolution continuation — applyLists → setLists → saveDashboardCache —
    // run in a microtask after the test body returns, outside `act()`. And the
    // wait pays for itself: a settled refetch releasing `creating` is the other
    // half of the trade that holds it open, and nothing else asserts it.
    releaseRefetch(twoLists)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /crear/i })).toBeEnabled(),
    )
  })

  // `silent` is not defensive — it is load-bearing on a reachable path, and
  // the suite could not see it because jsdom's localStorage always accepts a
  // write. That made the earlier green mutation a fact about the fixture
  // rather than about the code.
  //
  // `saveDashboardCache` swallows its own failure, so with storage blocked the
  // mount fetch still renders the screen and `loadDashboardCache` returns null
  // from then on. A failed create then refetches uncached; if that refetch
  // also fails, the default (non-silent) argument sets `fetchError`, whose
  // early return swaps the screen for the retry state — unmounting the toast
  // this path exists to show.
  it('keeps the message on screen when storage is unavailable', async () => {
    // The instance, not `Storage.prototype` — and the reason is `vitest.setup`,
    // not jsdom. That file replaces `globalThis.localStorage` with a plain
    // object literal (a Node 25 workaround), so what the app touches is not a
    // `Storage` at all and the prototype is unrelated to it. A prototype spy
    // therefore installs cleanly, never fires, and lets every write through.
    //
    // Worth stating as the shim rather than as a fact about jsdom: jsdom does
    // expose `setItem` on `Storage.prototype`, so the prototype form is
    // correct in a plain jsdom project — and the shim calls itself temporary,
    // so when it goes, this reason goes with it.
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.mocked(api.getLists)
      .mockResolvedValueOnce(twoLists as never)
      .mockRejectedValueOnce(new Error('offline too'))
    vi.mocked(api.createList).mockRejectedValue(new Error('boom'))

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())

    // The fixture only means anything if the write actually failed, and this
    // is what says so. Both `silent` branches in `fetchLists` sit behind
    // `!cached`, so a spy that quietly stops intercepting leaves a cache
    // populated, puts the flag back out of reach, and hands back a green run
    // from a test no longer testing its own name. State rather than mechanism,
    // so it outlives any change in how the state gets built.
    expect(localStorage.getItem('cqs_dashboard_cache_u1')).toBeNull()

    await openCreateAndSubmit('Costco')

    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo confirmar si se creó la lista/i),
      ).toBeInTheDocument(),
    )
    // Not the retry screen: its early return renders no Toast at all, so the
    // message above would never have been readable.
    expect(
      screen.queryByRole('button', { name: /reintentar/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Mercado')).toBeInTheDocument()
  })

  it('will not submit feedback without a connection, and says why', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())

    goOffline()
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /enviar feedback/i }))
    fireEvent.change(screen.getByLabelText(/mensaje/i), {
      target: { value: 'Great app' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }))

    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo enviar el feedback/i),
      ).toBeInTheDocument(),
    )
    // This is the assertion that separates the two, and the only one that does:
    // the toast string is shared with the network-failure path, and so is the
    // sheet staying open — see the failure test above, which asserts that same
    // pair, because the catch skips setFeedbackOpen(false) just as the guard's
    // early return does.
    expect(api.submitFeedback).not.toHaveBeenCalled()
    // Pinned rather than discriminating: the message has to survive for there
    // to be anything to send once there is a connection.
    expect(
      screen.getByRole('dialog', { name: /enviar feedback/i }),
    ).toBeInTheDocument()
  })
})

describe('notifications toggle', () => {
  beforeEach(() => {
    // The shared setup disables every flag; this control is gated on one.
    // Enable only that flag — a blanket `() => true` switches on unrelated
    // features whose code paths this file does not mock.
    vi.mocked(FeatureFlagsContext.useFeatureFlags).mockReturnValue({
      isEnabled: (flag: string) => flag === 'push_notifications',
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
  })

  it('offers to enable notifications when permission has not been answered', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })

    render(<DashboardScreen />)

    expect(
      await screen.findByRole('button', { name: /avisarme de cambios/i }),
    ).toBeInTheDocument()
  })

  it('switches to the blocked message when the user denies the prompt', async () => {
    // The regression this guards: denying does not change isPushEnabled() --
    // false before, false after -- so setPushOn is a same-value update and
    // React may skip the re-render. Reading permission live in JSX would then
    // leave the stale button on screen, which is the very state this control
    // exists to avoid.
    let permission = 'default'
    vi.stubGlobal('Notification', {
      get permission() {
        return permission
      },
      requestPermission: vi.fn(async () => {
        permission = 'denied'
        return 'denied'
      }),
    })

    render(<DashboardScreen />)
    fireEvent.click(
      await screen.findByRole('button', { name: /avisarme de cambios/i }),
    )

    expect(
      await screen.findByText(/ajustes de tu navegador/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /avisarme de cambios/i }),
    ).toBeNull()
  })

  it('explains how to unblock instead of offering a dead button when denied', async () => {
    // Once denied, requestPermission() returns without prompting, so a button
    // here would look broken: tapping it could never change anything.
    vi.stubGlobal('Notification', { permission: 'denied' })

    render(<DashboardScreen />)

    expect(
      await screen.findByText(/ajustes de tu navegador/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /avisarme de cambios/i }),
    ).toBeNull()
  })
})

describe('DashboardScreen — arranging', () => {
  const openCreateAndSubmit = async (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: /nueva lista/i }))
    fireEvent.change(await screen.findByPlaceholderText(/nombre/i), {
      target: { value: name },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))
  }

  const enterReorderMode = async () => {
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }))
  }

  // By class, not by role. DndContext mounts its own role="status" region for
  // drag announcements, so "the status region" is ambiguous on this screen.
  const moveStatus = () =>
    document.querySelector('.dashboard-screen__move-status')!

  const order = () =>
    JSON.parse(localStorage.getItem('list-order-u1') ?? 'null') as
      string[] | null

  beforeEach(() => {
    localStorage.removeItem('list-order-u1')
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
  })

  it('is not offered when there is nothing to arrange', async () => {
    vi.mocked(api.getLists).mockResolvedValue([twoLists[0]] as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(
      screen.queryByRole('button', { name: 'Reordenar' }),
    ).not.toBeInTheDocument()
  })

  it('turns the rows from ways in into things to arrange, and back', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()

    // Costco rather than Mercado: Mercado is the default list, so its label
    // carries a suffix and an exact match on the bare name would pass here
    // whether the row were a button or not.
    expect(
      screen.queryByRole('button', { name: 'Costco' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Subir Costco' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.getByRole('button', { name: 'Costco' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Subir Costco' }),
    ).not.toBeInTheDocument()
  })

  it('moves a list and remembers the new order', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()
    fireEvent.click(screen.getByRole('button', { name: 'Subir Costco' }))

    await waitFor(() => expect(order()).toEqual(['l2', 'l1']))
  })

  it('refuses the move that would go off the end, and saves nothing', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()
    fireEvent.click(screen.getByRole('button', { name: 'Subir Mercado' }))

    expect(order()).toBeNull()
  })

  // The assertion the rest of the suite cannot make. jsdom performs no layout,
  // so a row moving is invisible to it — but it does hold live-region text, and
  // that text is the entire feedback anyone not watching the panel receives.
  it('says where the list landed, and says it again on the next move', async () => {
    vi.mocked(api.getLists).mockResolvedValue([
      ...twoLists,
      { ...twoLists[0], id: 'l3', name: 'Farmacia', is_default: false },
    ] as never)
    render(<DashboardScreen />)
    await enterReorderMode()

    const region = moveStatus()
    fireEvent.click(screen.getByRole('button', { name: 'Subir Farmacia' }))
    await waitFor(() =>
      expect(region).toHaveTextContent('Farmacia movida a la posición 2 de 3.'),
    )

    // A polite region re-announces on a change of text. Had the message been
    // "Farmacia movida arriba", this second press would have been silence.
    fireEvent.click(screen.getByRole('button', { name: 'Subir Farmacia' }))
    await waitFor(() =>
      expect(region).toHaveTextContent('Farmacia movida a la posición 1 de 3.'),
    )
  })

  it('goes quiet when the arranging stops', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()
    fireEvent.click(screen.getByRole('button', { name: 'Subir Costco' }))
    await waitFor(() => expect(moveStatus()).toHaveTextContent('posición'))

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(moveStatus()).toHaveTextContent('')
  })

  // Pressing the toggle changes the accessible name of the element you are
  // already focused on, which VoiceOver on iOS generally does not re-announce.
  // The live region is the part that does not depend on the screen reader
  // noticing.
  it('announces entering the mode, and goes quiet on leaving', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()
    expect(moveStatus()).toHaveTextContent(/modo reordenar/i)

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(moveStatus()).toHaveTextContent('')
  })

  // Where the region sits is load-bearing, and it is checkable — DOM order is
  // not layout, so jsdom models it exactly.
  //
  // Both bounds, because either one alone passes a move that breaks the claim.
  // Asserting only "before the first row" still passes with the region hoisted
  // above the panel head, which would have a screen reader meet the
  // instructions before the control that produced them; asserting only "after
  // the toggle" still passes with it dropped below every row, beside
  // DndContext's own region, where nothing would reach it in time.
  it('is read after the toggle and before the first row', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()

    const region = moveStatus()
    expect(
      region.compareDocumentPosition(
        screen.getByRole('button', { name: 'Listo' }),
      ) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
    expect(
      region.compareDocumentPosition(
        screen.getByRole('button', { name: 'Subir Mercado' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  // The invariant is that arranging does not survive the row *set* changing —
  // not that it does not survive a fetch. The two are close enough today, and
  // come apart the moment this screen grows the short poll the rest of the app
  // has, at which point clearing per fetch would drop you out every tick.
  it('survives a refetch that brings back the same lists', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()
    fireEvent.click(screen.getByRole('button', { name: 'Subir Costco' }))
    await waitFor(() => expect(moveStatus()).toHaveTextContent('posición'))

    // getLists is still stubbed with the same two, so the refetch this create
    // triggers returns an identical set.
    await openCreateAndSubmit('Farmacia')
    await waitFor(() => expect(api.createList).toHaveBeenCalled())

    expect(
      screen.getByRole('button', { name: 'Subir Costco' }),
    ).toBeInTheDocument()
    expect(moveStatus()).toHaveTextContent('posición')
  })

  // The request has to die with the mode, or it comes back on its own. Deriving
  // `reordering` only stops it displaying; the flag underneath outlives the
  // condition that emptied it.
  it('does not return to arranging when the panel refills', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()
    expect(
      screen.getByRole('button', { name: 'Subir Costco' }),
    ).toBeInTheDocument()

    // A list goes away elsewhere, and something here causes a refetch.
    vi.mocked(api.getLists).mockResolvedValue([twoLists[0]] as never)
    await openCreateAndSubmit('Costco')
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Reordenar' }),
      ).not.toBeInTheDocument(),
    )

    // It comes back. Arranging must not.
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    await openCreateAndSubmit('Farmacia')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Reordenar' }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Subir Costco' }),
    ).not.toBeInTheDocument()
  })

  // Without this the mode is unusable by the people it exists for: press Subir,
  // the DOM reorders underneath, and if focus is not carried along a keyboard
  // user is returned to the top of the document after every single move.
  it('keeps focus on the button that was pressed, including at the top', async () => {
    render(<DashboardScreen />)
    await enterReorderMode()

    const up = screen.getByRole('button', { name: 'Subir Costco' })
    up.focus()
    expect(document.activeElement).toBe(up)

    fireEvent.click(up)
    await waitFor(() => expect(order()).toEqual(['l2', 'l1']))

    // Costco is now first, so its own Subir is the unavailable one — which is
    // exactly the case a real `disabled` would have blurred.
    const upAfter = screen.getByRole('button', { name: 'Subir Costco' })
    expect(upAfter).toHaveAttribute('aria-disabled', 'true')
    expect(document.activeElement).toBe(upAfter)
  })
})
