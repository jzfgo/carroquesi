import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as FeatureFlagsContext from '../contexts/FeatureFlagsContext'
import * as useApplePlatformModule from '../hooks/useApplePlatform'
import * as usePWAInstallModule from '../hooks/usePWAInstall'
import * as api from '../lib/api'
import { SettingsSheet } from './SettingsSheet'
import { ThemeManager } from './ThemeManager'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: vi.fn(),
}))
// Stubbed so no transitive import builds the real Firebase app, which needs
// credentials the test runner does not have. Null messaging short-circuits
// the push lifecycle.
vi.mock('../lib/firebase', () => ({
  getFirebaseAuth: vi.fn(() => ({ currentUser: null })),
  getFirebaseAi: vi.fn(() => ({})),
  getMessagingIfSupported: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('../lib/api')
vi.mock('../hooks/usePWAInstall')
vi.mock('../hooks/useApplePlatform')

const mockGetToken = vi.fn(async () => 'token')
const mockSignOut = vi.fn(async () => undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  localStorage.removeItem('push-device-subscribed')
  localStorage.removeItem('cqs_theme')
  document.documentElement.classList.remove('theme-light', 'theme-dark')
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
  vi.mocked(FeatureFlagsContext.useFeatureFlags).mockReturnValue({
    isEnabled: () => false,
  })
  vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
    isInstallable: false,
    isInstalled: false,
    isIOS: false,
    promptInstall: vi.fn(async () => undefined),
  })
  vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(false)
  vi.mocked(api.openShortcutImport).mockImplementation(() => {})
  // Steady state: the user already has a key, so issuance is a no-op that
  // returns no plaintext. First-issuance tests override this per-case.
  vi.mocked(api.issueApiKey).mockResolvedValue({
    key: null,
    created: false,
  } as never)
  vi.mocked(api.regenerateApiKey).mockResolvedValue({
    key: 'cqs_new-key',
    regenerated_at: '',
  } as never)
})

function renderSheet(
  overrides: Partial<Parameters<typeof SettingsSheet>[0]> = {},
) {
  const handlers = {
    onFeedback: vi.fn(),
    onToast: vi.fn(),
    onClose: vi.fn(),
  }
  render(
    <SettingsSheet defaultListName="Mercado" {...handlers} {...overrides} />,
  )
  return handlers
}

function enablePushFlag() {
  vi.mocked(FeatureFlagsContext.useFeatureFlags).mockReturnValue({
    isEnabled: (flag: string) => flag === 'push_notifications',
  })
}

describe('SettingsSheet — identity and footer', () => {
  it('shows the identity header with name and email', () => {
    renderSheet()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('shows the app version in the footer', () => {
    renderSheet()
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument()
  })

  it('signs out from "Salir de la cuenta"', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /salir de la cuenta/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('Escape dismisses the sheet', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('SettingsSheet — Aspecto', () => {
  // Class application lives in ThemeManager (subscribed to lib/theme), so the
  // tests that assert the html class mount the sheet inside it, as App does.
  function renderWithThemeManager() {
    render(
      <ThemeManager>
        <SettingsSheet
          defaultListName="Mercado"
          onFeedback={vi.fn()}
          onToast={vi.fn()}
          onClose={vi.fn()}
        />
      </ThemeManager>,
    )
  }

  it('renders the three options as radios, Sistema checked by default', () => {
    renderSheet()
    const group = screen.getByRole('radiogroup', { name: 'Aspecto' })
    expect(group).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      'Claro',
      'Oscuro',
      'Sistema',
    ])
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('is the first block, above Avisos', () => {
    enablePushFlag()
    vi.stubGlobal('Notification', { permission: 'default' })
    renderSheet()
    const aspecto = screen.getByText('Aspecto', { selector: 'h3' })
    const avisos = screen.getByText('Avisos', { selector: 'h3' })
    expect(
      aspecto.compareDocumentPosition(avisos) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('picking Claro persists the preference and applies the light class', () => {
    renderWithThemeManager()
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }))
    expect(localStorage.getItem('cqs_theme')).toBe('light')
    expect(document.documentElement.classList.contains('theme-light')).toBe(
      true,
    )
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('picking Oscuro persists the preference and applies the dark class', () => {
    renderWithThemeManager()
    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    expect(localStorage.getItem('cqs_theme')).toBe('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })

  it('returning to Sistema clears the stored key and both classes', () => {
    renderWithThemeManager()
    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sistema' }))
    expect(localStorage.getItem('cqs_theme')).toBeNull()
    expect(document.documentElement.classList.contains('theme-dark')).toBe(
      false,
    )
    expect(document.documentElement.classList.contains('theme-light')).toBe(
      false,
    )
  })

  it('reopens with the stored preference selected', () => {
    localStorage.setItem('cqs_theme', 'dark')
    renderSheet()
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('arrow keys move selection and focus, wrapping at the ends', () => {
    renderSheet()
    const sistema = screen.getByRole('radio', { name: 'Sistema' })
    // Roving tabindex: only the checked radio is in the tab order.
    expect(sistema).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute(
      'tabindex',
      '-1',
    )

    sistema.focus()
    fireEvent.keyDown(sistema, { key: 'ArrowRight' })
    const claro = screen.getByRole('radio', { name: 'Claro' })
    expect(claro).toHaveAttribute('aria-checked', 'true')
    expect(claro).toHaveFocus()
    expect(localStorage.getItem('cqs_theme')).toBe('light')

    fireEvent.keyDown(claro, { key: 'ArrowLeft' })
    const sistemaAgain = screen.getByRole('radio', { name: 'Sistema' })
    expect(sistemaAgain).toHaveAttribute('aria-checked', 'true')
    expect(sistemaAgain).toHaveFocus()
    expect(localStorage.getItem('cqs_theme')).toBeNull()
  })
})

describe('SettingsSheet — Avisos', () => {
  it('hides the block when the push flag is disabled', () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    renderSheet()
    expect(screen.queryByText('Avisos en este dispositivo')).toBeNull()
  })

  it('hides the block where push cannot work (non-iOS, no Notification API)', () => {
    enablePushFlag()
    renderSheet()
    expect(screen.queryByText('Avisos en este dispositivo')).toBeNull()
  })

  it('shows the block on an uninstalled iPhone even though push cannot work yet', () => {
    enablePushFlag()
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: false,
      isInstalled: false,
      isIOS: true,
      promptInstall: vi.fn(async () => undefined),
    })
    renderSheet()
    expect(screen.getByText('Avisos en este dispositivo')).toBeInTheDocument()
  })

  it('offers the switch, off, when permission has not been answered', () => {
    enablePushFlag()
    vi.stubGlobal('Notification', { permission: 'default' })
    renderSheet()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByText('El sistema te lo preguntará una sola vez'),
    ).toBeInTheDocument()
  })

  it('shows the switch on when this device is subscribed', () => {
    enablePushFlag()
    vi.stubGlobal('Notification', { permission: 'granted' })
    localStorage.setItem('push-device-subscribed', '1')
    renderSheet()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByText('Cuando alguien añada o compre en tus listas'),
    ).toBeInTheDocument()
  })

  it('promises no re-prompt when permission is granted but this device is off', () => {
    enablePushFlag()
    vi.stubGlobal('Notification', { permission: 'granted' })
    renderSheet()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByText('Se vuelven a encender sin volver a preguntar'),
    ).toBeInTheDocument()
  })

  it('turning off unsubscribes this device and flips the switch', async () => {
    enablePushFlag()
    vi.stubGlobal('Notification', { permission: 'granted' })
    localStorage.setItem('push-device-subscribed', '1')
    renderSheet()
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() =>
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'false',
      ),
    )
    expect(localStorage.getItem('push-device-subscribed')).toBeNull()
  })

  it('switches to the blocked message when the user denies the prompt', async () => {
    // The regression this guards: denying does not change isPushEnabled() --
    // false before, false after -- so setPushOn is a same-value update and
    // React may skip the re-render. Reading permission live in JSX would then
    // leave the stale switch on screen.
    enablePushFlag()
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
    renderSheet()
    fireEvent.click(screen.getByRole('switch'))
    expect(
      await screen.findByText('Bloqueados en los ajustes del sistema, no aquí'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows the blocked message instead of a dead switch when denied', () => {
    enablePushFlag()
    vi.stubGlobal('Notification', { permission: 'denied' })
    renderSheet()
    expect(
      screen.getByText('Bloqueados en los ajustes del sistema, no aquí'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('«Cómo» expands the unblock instructions inline, and collapses them again', () => {
    enablePushFlag()
    vi.stubGlobal('Notification', { permission: 'denied' })
    renderSheet()
    expect(screen.queryByText(/ajustes de tu navegador/i)).toBeNull()

    const how = screen.getByRole('button', { name: 'Cómo' })
    expect(how).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(how)
    expect(how).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/ajustes de tu navegador/i)).toBeInTheDocument()

    fireEvent.click(how)
    expect(screen.queryByText(/ajustes de tu navegador/i)).toBeNull()
  })

  it('on an uninstalled iPhone the row leads to the install row, no switch', () => {
    enablePushFlag()
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: false,
      isInstalled: false,
      isIOS: true,
      promptInstall: vi.fn(async () => undefined),
    })
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    renderSheet()

    expect(
      screen.getByText(
        'En iPhone hay que instalar la app en la pantalla de inicio',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    // The invariant the chevron relies on: not installed means the install
    // row is on this same sheet, so there is always somewhere to scroll to.
    expect(
      screen.getByText('Instalar en la pantalla de inicio'),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /avisos en este dispositivo/i }),
    )
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })
    // and it scrolled the install row, not something else
    expect(
      (scrollIntoView.mock.contexts[0] as HTMLElement).textContent,
    ).toContain('Instalar en la pantalla de inicio')
  })
})

describe('SettingsSheet — Atajo de Siri', () => {
  it('hides the block on non-Apple platforms and never issues a key', () => {
    renderSheet()
    expect(screen.queryByText('Atajo de Siri')).toBeNull()
    expect(api.issueApiKey).not.toHaveBeenCalled()
  })

  it('names the default list on the informational row', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    renderSheet()
    expect(screen.getByText('Añade a «Mercado»')).toBeInTheDocument()
    expect(screen.getByText('La lista predeterminada')).toBeInTheDocument()
    await waitFor(() => expect(api.issueApiKey).toHaveBeenCalledOnce())
  })

  it('nudges to mark a default list instead of issuing a key without one', () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    renderSheet({ defaultListName: null })
    expect(
      screen.getByText(/marca una lista como predeterminada/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Tu clave')).toBeNull()
    expect(api.issueApiKey).not.toHaveBeenCalled()
  })

  it('shows a loading state on the key row until issuance resolves', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    let resolveIssue!: (v: { key: string | null; created: boolean }) => void
    vi.mocked(api.issueApiKey).mockReturnValue(
      new Promise((resolve) => {
        resolveIssue = resolve
      }) as never,
    )
    renderSheet()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Regenerar' })).toBeNull()
    resolveIssue({ key: null, created: false })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Regenerar' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText('Cargando…')).toBeNull()
  })

  it('first issuance: the key can be copied, and is never shown in plaintext', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockResolvedValue({
      key: 'cqs_test-key',
      created: true,
    } as never)
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    const { onToast } = renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('cqs_test-key'))
    expect(onToast).toHaveBeenCalledWith('Clave copiada')
    expect(screen.queryByText('cqs_test-key')).toBeNull()
  })

  it('returning user: no plaintext is held, so there is nothing to copy', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    renderSheet()
    expect(
      await screen.findByRole('button', { name: 'Regenerar' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copiar' })).toBeNull()
  })

  it('toasts when issuing the key fails', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    vi.mocked(api.issueApiKey).mockRejectedValue(new Error('boom'))
    const { onToast } = renderSheet()
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'No se pudo preparar el atajo de Siri. Inténtalo de nuevo.',
      ),
    )
  })

  it('"Añadir el atajo a Shortcuts" launches the import', async () => {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    renderSheet()
    fireEvent.click(
      await screen.findByRole('button', { name: /añadir el atajo/i }),
    )
    expect(api.openShortcutImport).toHaveBeenCalledOnce()
  })
})

describe('SettingsSheet — regenerate confirm flow', () => {
  async function openConfirm() {
    vi.mocked(useApplePlatformModule.useApplePlatform).mockReturnValue(true)
    const handlers = renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerar' }))
    expect(
      screen.getByRole('dialog', { name: 'Regenerar clave' }),
    ).toBeInTheDocument()
    return handlers
  }

  it('confirming rotates the key and returns to the settings view', async () => {
    await openConfirm()
    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(
      screen.getByText(/se invalidará tu clave actual/i),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /sí, regenerar/i }))
    await waitFor(() => expect(api.regenerateApiKey).toHaveBeenCalledOnce())
    expect(
      await screen.findByRole('dialog', { name: 'Ajustes' }),
    ).toBeInTheDocument()
    // the fresh plaintext is now copyable
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument()
  })

  it('cancelling does not rotate the key', async () => {
    await openConfirm()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()
  })

  it('toasts on failure and returns to the settings view, sheet still open', async () => {
    vi.mocked(api.regenerateApiKey).mockRejectedValue(new Error('boom'))
    const { onToast, onClose } = await openConfirm()
    fireEvent.click(screen.getByRole('button', { name: /sí, regenerar/i }))
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'No se pudo regenerar la clave. Inténtalo de nuevo.',
      ),
    )
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape in the confirm sub-state returns to the settings view instead of closing', async () => {
    const { onClose } = await openConfirm()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('scrim click in the confirm sub-state returns to the settings view instead of closing', async () => {
    const { onClose } = await openConfirm()
    fireEvent.click(document.querySelector('.modal-sheet-scrim')!)
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dismissal is inert while a regeneration is in flight', async () => {
    let resolveRegenerate!: (v: { key: string; regenerated_at: string }) => void
    vi.mocked(api.regenerateApiKey).mockReturnValue(
      new Promise((resolve) => {
        resolveRegenerate = resolve
      }) as never,
    )
    const { onClose } = await openConfirm()
    fireEvent.click(screen.getByRole('button', { name: /sí, regenerar/i }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.getByRole('dialog', { name: 'Regenerar clave' }),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    resolveRegenerate({ key: 'cqs_new-key', regenerated_at: '' })
    expect(
      await screen.findByRole('dialog', { name: 'Ajustes' }),
    ).toBeInTheDocument()
  })
})

describe('SettingsSheet — La app', () => {
  it('offers install as an action when the browser can prompt', () => {
    const promptInstall = vi.fn(async () => undefined)
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall,
    })
    renderSheet()
    fireEvent.click(
      screen.getByRole('button', { name: /instalar en la pantalla/i }),
    )
    expect(promptInstall).toHaveBeenCalledOnce()
  })

  it('shows the manual instruction on iOS instead of a dead action', () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: false,
      isInstalled: false,
      isIOS: true,
      promptInstall: vi.fn(async () => undefined),
    })
    renderSheet()
    expect(
      screen.getByText('Instalar en la pantalla de inicio'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Compartir → Añadir a pantalla de inicio'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /instalar en la pantalla/i }),
    ).toBeNull()
  })

  it('hides the install row once the app is installed', () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: true,
      isIOS: false,
      promptInstall: vi.fn(async () => undefined),
    })
    renderSheet()
    expect(screen.queryByText('Instalar en la pantalla de inicio')).toBeNull()
  })

  it('hides the install row when there is nothing to offer', () => {
    renderSheet()
    expect(screen.queryByText('Instalar en la pantalla de inicio')).toBeNull()
  })

  it('"Contar algo al equipo" hands over to the feedback flow', () => {
    const { onFeedback } = renderSheet()
    fireEvent.click(
      screen.getByRole('button', { name: /contar algo al equipo/i }),
    )
    expect(onFeedback).toHaveBeenCalledOnce()
  })
})
