import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../contexts/AuthContext'
import * as api from '../lib/api'
import { SettingsSheet } from './SettingsSheet'

// lib/push imports lib/firebase, which calls getAuth() at module scope and
// throws auth/invalid-api-key without Firebase env vars.
vi.mock('../lib/firebase', () => ({
  auth: {},
  ai: {},
  messagingPromise: Promise.resolve(null),
}))
vi.mock('../lib/api')

const user: AuthUser = {
  id: 'u1',
  displayName: 'Alice',
  photoUrl: null,
  email: 'alice@example.com',
  features: [],
}

const onClose = vi.fn()
const onToast = vi.fn()
const onSignOut = vi.fn()
const onOpenFeedback = vi.fn()

const props = {
  user,
  getToken: vi.fn(async () => 'token'),
  pushAvailable: false,
  isIOS: false,
  isInstalled: false,
  isInstallable: false,
  promptInstall: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isApplePlatform: false,
  defaultListName: 'Mercado',
  onOpenFeedback,
  onSignOut,
  onToast,
  onClose,
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubGlobal('Notification', { permission: 'default' })
  vi.mocked(api.issueApiKey).mockResolvedValue({
    key: null,
    created: false,
  } as never)
  vi.mocked(api.openShortcutImport).mockImplementation(() => {})
})

describe('SettingsSheet — notifications', () => {
  const withPush = { ...props, pushAvailable: true }

  it('is not offered at all without the feature flag', () => {
    render(<SettingsSheet {...props} />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText(/avisos en este dispositivo/i)).toBeNull()
  })

  it('offers a switch that has not been answered yet', () => {
    render(<SettingsSheet {...withPush} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/una sola vez/i)).toBeInTheDocument()
  })

  it('shows on when the system granted and this device subscribed', () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    localStorage.setItem('push-device-subscribed', '1')
    render(<SettingsSheet {...withPush} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByText(/añada o compre en tus listas/i),
    ).toBeInTheDocument()
  })

  // The state that only exists because the token is per device: identical to
  // "on" read from the system, its opposite to the person holding the phone.
  it('shows off here although granted, and says it will not ask again', () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    render(<SettingsSheet {...withPush} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/sin volver a preguntar/i)).toBeInTheDocument()
  })

  it('offers no switch at all when the system has blocked them', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    render(<SettingsSheet {...withPush} />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText(/bloqueados en los ajustes/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^cómo$/i }))
    expect(screen.getByText(/ajustes de tu navegador/i)).toBeInTheDocument()
  })

  it('offers no switch on an iPhone that has not installed the app', () => {
    vi.stubGlobal('Notification', undefined)
    render(<SettingsSheet {...withPush} isIOS />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(
      screen.getByText(/en iphone hay que instalar la app/i),
    ).toBeInTheDocument()
    // Sends people to the install row instead of repeating its explanation.
    expect(
      screen.getByRole('button', { name: /ir a instalar/i }),
    ).toBeInTheDocument()
  })

  // An iPhone already on the home screen but too old for Web Push lands in the
  // same state with nowhere to be sent.
  it('drops the chevron when there is no install row behind it', () => {
    vi.stubGlobal('Notification', undefined)
    render(<SettingsSheet {...withPush} isIOS isInstalled />)
    expect(screen.queryByRole('button', { name: /ir a instalar/i })).toBeNull()
    expect(
      screen.getByText(/en iphone hay que instalar la app/i),
    ).toBeInTheDocument()
  })

  it('points the switch at the line that tells its three states apart', () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    render(<SettingsSheet {...withPush} />)
    expect(screen.getByRole('switch')).toHaveAccessibleDescription(
      /sin volver a preguntar/i,
    )
  })

  it('says a browser without the API cannot, without telling it to install', () => {
    vi.stubGlobal('Notification', undefined)
    render(<SettingsSheet {...withPush} />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText(/no puede recibir avisos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ir a instalar/i })).toBeNull()
  })

  /**
   * The regression this exists for: a handler that awaits anything — an auth
   * token, a transition — before requesting permission can lose the gesture in
   * WebKit, and on iOS the denial that follows is permanent for the origin.
   *
   * There is deliberately no `await` between the click and the assertion. Add
   * one and this passes again while the bug is back.
   */
  it('requests permission synchronously from the tap, before any await', () => {
    const requestPermission = vi.fn(async () => 'granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })

    render(<SettingsSheet {...withPush} />)
    fireEvent.click(screen.getByRole('switch'))

    expect(requestPermission).toHaveBeenCalledOnce()
  })

  it('turns on from granted-without-token without prompting again', () => {
    const requestPermission = vi.fn(async () => 'granted')
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission })

    render(<SettingsSheet {...withPush} />)
    fireEvent.click(screen.getByRole('switch'))

    // enablePush reaches requestPermission either way; what matters is that the
    // browser does not re-prompt, which it will not once permission is granted.
    expect(requestPermission).toHaveBeenCalledOnce()
  })

  it('moves to the blocked row once the prompt is denied', async () => {
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

    render(<SettingsSheet {...props} pushAvailable />)
    fireEvent.click(screen.getByRole('switch'))

    expect(
      await screen.findByText(/bloqueados en los ajustes/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

describe('SettingsSheet — appearance', () => {
  it('offers three options rather than a switch, system by default', () => {
    render(<SettingsSheet {...props} />)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
  })
})

describe('SettingsSheet — the Siri shortcut', () => {
  const apple = { ...props, isApplePlatform: true }

  it('is absent off Apple platforms', () => {
    render(<SettingsSheet {...props} />)
    expect(screen.queryByText(/atajo de siri/i)).toBeNull()
  })

  it('names the default list as the destination', () => {
    render(<SettingsSheet {...apple} />)
    expect(screen.getByText('Añade a «Mercado»')).toBeInTheDocument()
  })

  it('says to mark one when there is no default list', () => {
    render(<SettingsSheet {...apple} defaultListName={null} />)
    expect(screen.getByText(/sin lista predeterminada/i)).toBeInTheDocument()
  })

  it('shows the key masked until there is a plaintext one to show', () => {
    render(<SettingsSheet {...apple} />)
    expect(screen.getByText('••••••••••••••••')).toBeInTheDocument()
  })

  it('issues on first copy and writes the key to the clipboard', async () => {
    vi.mocked(api.issueApiKey).mockResolvedValue({
      key: 'cqs_test-key',
      created: true,
    } as never)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(<SettingsSheet {...apple} />)
    fireEvent.click(screen.getByRole('button', { name: /^copiar$/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('cqs_test-key'))
    expect(onToast).toHaveBeenCalledWith('Clave copiada')
    expect(screen.getByText('cqs_test-key')).toBeInTheDocument()
  })

  it('steers a returning user to regenerate, because the key is unrecoverable', async () => {
    render(<SettingsSheet {...apple} />)
    fireEvent.click(screen.getByRole('button', { name: /^copiar$/i }))

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Tu clave está oculta. Regenérala para obtener una nueva.',
      ),
    )
  })

  it('refuses to issue a key with no default list to send items to', async () => {
    render(<SettingsSheet {...apple} defaultListName={null} />)
    fireEvent.click(screen.getByRole('button', { name: /^copiar$/i }))

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Marca una lista como predeterminada para usar el atajo de Siri',
      ),
    )
    expect(api.issueApiKey).not.toHaveBeenCalled()
  })

  it('says so when issuing fails', async () => {
    vi.mocked(api.issueApiKey).mockRejectedValue(new Error('boom'))
    render(<SettingsSheet {...apple} />)
    fireEvent.click(screen.getByRole('button', { name: /^copiar$/i }))

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'No se pudo preparar el atajo de Siri. Inténtalo de nuevo.',
      ),
    )
  })

  it('asks before rotating, in the row rather than in a second modal', async () => {
    vi.mocked(api.regenerateApiKey).mockResolvedValue({
      key: 'cqs_new-key',
      regenerated_at: '',
    } as never)

    render(<SettingsSheet {...apple} />)
    fireEvent.click(screen.getByRole('button', { name: /^regenerar$/i }))

    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(
      screen.getByText(/se invalidará tu clave actual/i),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /sí, regenerar/i }))
    await waitFor(() => expect(api.regenerateApiKey).toHaveBeenCalledOnce())
    expect(await screen.findByText('cqs_new-key')).toBeInTheDocument()
  })

  it('rotates nothing when the confirmation is cancelled', () => {
    render(<SettingsSheet {...apple} />)
    fireEvent.click(screen.getByRole('button', { name: /^regenerar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(api.regenerateApiKey).not.toHaveBeenCalled()
    expect(screen.getByText('••••••••••••••••')).toBeInTheDocument()
  })

  it('says so when rotating fails', async () => {
    vi.mocked(api.regenerateApiKey).mockRejectedValue(new Error('boom'))
    render(<SettingsSheet {...apple} />)
    fireEvent.click(screen.getByRole('button', { name: /^regenerar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, regenerar/i }))

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'No se pudo regenerar la clave. Inténtalo de nuevo.',
      ),
    )
  })

  it('launches the import only on an explicit tap', () => {
    render(<SettingsSheet {...apple} />)
    expect(api.openShortcutImport).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: /añadir el atajo a shortcuts/i }),
    )
    expect(api.openShortcutImport).toHaveBeenCalledOnce()
  })
})

describe('SettingsSheet — the app block', () => {
  it('prompts to install where the browser can', () => {
    const promptInstall = vi.fn<() => Promise<void>>().mockResolvedValue()
    render(
      <SettingsSheet {...props} isInstallable promptInstall={promptInstall} />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /instalar en la pantalla/i }),
    )
    expect(promptInstall).toHaveBeenCalledOnce()
  })

  it('gives the manual instruction on iOS, where there is no prompt to fire', () => {
    render(<SettingsSheet {...props} isIOS />)
    expect(
      screen.getByText(/compartir → añadir a pantalla de inicio/i),
    ).toBeInTheDocument()
  })

  it('drops the row once the app is installed', () => {
    render(<SettingsSheet {...props} isInstallable isInstalled />)
    expect(screen.queryByText(/instalar en la pantalla/i)).toBeNull()
  })

  it('asks for the version in the house voice, not "feedback"', () => {
    render(<SettingsSheet {...props} />)
    fireEvent.click(
      screen.getByRole('button', { name: /contar algo al equipo/i }),
    )
    expect(onOpenFeedback).toHaveBeenCalledOnce()
  })
})

describe('SettingsSheet — the sheet itself', () => {
  it('prints who is signed in', () => {
    render(<SettingsSheet {...props} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('prints the version, which is what gets asked for when something breaks', () => {
    render(<SettingsSheet {...props} />)
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument()
  })

  it('signs out from the foot', () => {
    render(<SettingsSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /salir de la cuenta/i }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('closes on Escape and on the overlay', () => {
    const { container } = render(<SettingsSheet {...props} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    fireEvent.click(container.querySelector('.settings-sheet__overlay')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
