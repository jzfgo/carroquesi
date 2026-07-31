import { ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { AuthUser } from '../contexts/AuthContext'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { issueApiKey, openShortcutImport, regenerateApiKey } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { APP_VERSION } from '../lib/environment'
import type { PushState } from '../lib/push'
import {
  canReceivePush,
  disablePush,
  enablePush,
  isPushEnabled,
  permissionState,
  pushState,
} from '../lib/push'
import { AppearanceSegment } from './AppearanceSegment'
import './SettingsSheet.css'

const MASK = '••••••••••••••••'

const PUSH_SUBTITLE: Record<Exclude<PushState, 'unavailable'>, string> = {
  ask: 'El sistema te lo preguntará una sola vez',
  on: 'Cuando alguien añada o compre en tus listas',
  off: 'Se vuelven a encender sin volver a preguntar',
  denied: 'Bloqueados en los ajustes del sistema, no aquí',
}

interface Props {
  user: AuthUser | null
  getToken: () => Promise<string>
  /** False hides the whole notifications block: no switch for a feature the account lacks. */
  pushAvailable: boolean
  isIOS: boolean
  isInstalled: boolean
  isInstallable: boolean
  promptInstall: () => Promise<void>
  /** The Siri block is Apple-only, exactly as the menu item was. */
  isApplePlatform: boolean
  /** Where Siri-added items land, or null when no list is marked. */
  defaultListName: string | null
  onOpenFeedback: () => void
  onSignOut: () => void
  onToast: (message: string) => void
  onClose: () => void
}

/**
 * Everything that was settings, in one sheet.
 *
 * It replaces the avatar menu, the install banner and the notifications button,
 * which between them stated installing twice and put the notification switch on
 * a different screen from the sentence describing it.
 *
 * A flat surface in the same palette: no board, no handwriting. Paper belongs
 * inside an open list, and this is not one.
 */
export function SettingsSheet({
  user,
  getToken,
  pushAvailable,
  isIOS,
  isInstalled,
  isInstallable,
  promptInstall,
  isApplePlatform,
  defaultListName,
  onOpenFeedback,
  onSignOut,
  onToast,
  onClose,
}: Props) {
  const id = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  // The install row is a button where the browser can prompt and a plain row
  // where it cannot, so this holds either element.
  const installRef = useRef<HTMLElement | null>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  const [pushOn, setPushOn] = useState(() => isPushEnabled())
  // Permission is held rather than read inline. A denial leaves isPushEnabled()
  // false on both sides, so setting that alone is a same-value update React may
  // skip, and the blocked row would never appear. This value does change.
  const [permission, setPermission] = useState(() => permissionState())
  const [howOpen, setHowOpen] = useState(false)

  const [shownKey, setShownKey] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const canReceive = canReceivePush({ isIOS, isInstalled })
  const state = pushState(canReceive, permission, pushOn)
  // Installed is checked first and on its own: a browser can still report the
  // app as installable after it has been installed, and offering to install it
  // again is the duplication this sheet exists to remove.
  const showInstallRow = !isInstalled && (isInstallable || isIOS)

  function syncPushState() {
    setPushOn(isPushEnabled())
    setPermission(permissionState())
  }

  /**
   * The permission request has to be the first thing this does.
   *
   * `enablePush` opens with `Notification.requestPermission()`, so calling it
   * without awaiting anything first hands it the user's gesture intact. Any
   * await before this line can cost the grant in WebKit, and on iOS a denial is
   * permanent for the whole origin — a bet with no upside.
   */
  function handleTogglePush() {
    const request = pushOn ? disablePush(getToken) : enablePush(getToken)
    void request.catch(() => undefined).finally(syncPushState)
  }

  async function handleCopyKey() {
    if (!defaultListName) {
      onToast('Marca una lista como predeterminada para usar el atajo de Siri')
      return
    }
    let key = shownKey
    if (!key) {
      try {
        // Idempotent, and only ever hands back plaintext on first issuance:
        // what the server keeps is a hash. A returning user gets null and is
        // told to regenerate.
        key = (await issueApiKey(getToken)).key
      } catch {
        onToast('No se pudo preparar el atajo de Siri. Inténtalo de nuevo.')
        return
      }
      setShownKey(key)
    }
    if (!key) {
      onToast('Tu clave está oculta. Regenérala para obtener una nueva.')
      return
    }
    const ok = await copyToClipboard(key)
    onToast(ok ? 'Clave copiada' : 'No se pudo copiar la clave')
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const { key } = await regenerateApiKey(getToken)
      setShownKey(key)
      onToast('Clave regenerada. Pégala en el atajo.')
    } catch {
      onToast('No se pudo regenerar la clave. Inténtalo de nuevo.')
    }
    setRegenerating(false)
    setConfirming(false)
  }

  function focusInstallRow() {
    installRef.current?.focus()
    installRef.current?.scrollIntoView({ block: 'center' })
  }

  return (
    <>
      <div className="settings-sheet__overlay" onClick={onClose} />
      <div
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
        ref={sheetRef}
      >
        <div className="settings-sheet__handle" {...swipe} />

        <div className="settings-sheet__account">
          <span className="settings-sheet__avatar" aria-hidden="true">
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="" />
            ) : (
              <span>{user?.displayName?.[0] ?? '?'}</span>
            )}
          </span>
          <span className="settings-sheet__identity">
            <span className="settings-sheet__name">{user?.displayName}</span>
            <span className="settings-sheet__email">{user?.email}</span>
          </span>
        </div>

        <div className="settings-sheet__scroll">
          {pushAvailable && (
            <section className="settings-sheet__block">
              <h2 className="settings-sheet__block-title">Avisos</h2>
              <div className="settings-sheet__row">
                <span className="settings-sheet__row-text">
                  <span className="settings-sheet__row-label">
                    Avisos en este dispositivo
                  </span>
                  <span className="settings-sheet__row-sub" id={`${id}-push`}>
                    {state === 'unavailable'
                      ? isIOS
                        ? 'En iPhone hay que instalar la app en la pantalla de inicio'
                        : 'Este navegador no puede recibir avisos'
                      : PUSH_SUBTITLE[state]}
                  </span>
                </span>
                {(state === 'ask' || state === 'on' || state === 'off') && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={state === 'on'}
                    aria-label="Avisos en este dispositivo"
                    // The three switch states share a name and differ only in
                    // the line under it, so a reader that skipped the row would
                    // hear the same control three ways.
                    aria-describedby={`${id}-push`}
                    className={`settings-sheet__switch${
                      state === 'on' ? ' settings-sheet__switch--on' : ''
                    }`}
                    onClick={handleTogglePush}
                  >
                    <span className="settings-sheet__switch-knob" />
                  </button>
                )}
                {/* No switch here on purpose. The browser will not re-prompt
                    once denied, so a switch would call requestPermission,
                    return at once and change nothing — a control that looks
                    broken. The app does not pretend it can unblock itself. */}
                {state === 'denied' && (
                  <button
                    type="button"
                    className="settings-sheet__row-action"
                    aria-expanded={howOpen}
                    onClick={() => setHowOpen((o) => !o)}
                  >
                    Cómo
                  </button>
                )}
                {/* Only where there is an install row to be sent to. An iPhone
                    already on the home screen but too old for Web Push reaches
                    this same state, and pointing it at a row that is not there
                    is the broken-looking control this row avoids elsewhere. */}
                {state === 'unavailable' && isIOS && showInstallRow && (
                  <button
                    type="button"
                    className="settings-sheet__row-chevron"
                    aria-label="Ir a instalar la app"
                    onClick={focusInstallRow}
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
              {state === 'denied' && howOpen && (
                <p className="settings-sheet__note">
                  Abre los ajustes de tu navegador, busca las notificaciones de
                  este sitio y vuelve a permitirlas.
                </p>
              )}
            </section>
          )}

          <section className="settings-sheet__block">
            <h2 className="settings-sheet__block-title">Aspecto</h2>
            <div className="settings-sheet__segment">
              <AppearanceSegment />
            </div>
          </section>

          {isApplePlatform && (
            <section className="settings-sheet__block">
              <h2 className="settings-sheet__block-title">Atajo de Siri</h2>
              {/* States the target, and is not a control: the default list is
                  chosen from the list's own sheet, and there is no screen here
                  to send anyone to. */}
              <div className="settings-sheet__row">
                <span className="settings-sheet__row-text">
                  <span className="settings-sheet__row-label">
                    {defaultListName
                      ? `Añade a «${defaultListName}»`
                      : 'Sin lista predeterminada'}
                  </span>
                  <span className="settings-sheet__row-sub">
                    {defaultListName
                      ? 'La lista predeterminada'
                      : 'Marca una lista como predeterminada para usar el atajo'}
                  </span>
                </span>
              </div>

              {confirming ? (
                <div className="settings-sheet__row settings-sheet__row--confirm">
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-label">
                      Regenerar clave
                    </span>
                    <span className="settings-sheet__row-sub">
                      Se invalidará tu clave actual y tendrás que pegar la nueva
                      en el atajo.
                    </span>
                  </span>
                  <span className="settings-sheet__row-actions">
                    <button
                      type="button"
                      className="settings-sheet__row-action"
                      disabled={regenerating}
                      onClick={() => void handleRegenerate()}
                    >
                      {regenerating ? 'Regenerando…' : 'Sí, regenerar'}
                    </button>
                    <button
                      type="button"
                      className="settings-sheet__row-action settings-sheet__row-action--quiet"
                      disabled={regenerating}
                      onClick={() => setConfirming(false)}
                    >
                      Cancelar
                    </button>
                  </span>
                </div>
              ) : (
                <div className="settings-sheet__row">
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-label">Tu clave</span>
                    <span className="settings-sheet__key">
                      {shownKey ?? MASK}
                    </span>
                  </span>
                  <span className="settings-sheet__row-actions">
                    <button
                      type="button"
                      className="settings-sheet__row-action"
                      onClick={() => void handleCopyKey()}
                    >
                      Copiar
                    </button>
                    {/* Destructive, and deliberately not red: it is undone in a
                        minute and it already asks first. */}
                    <button
                      type="button"
                      className="settings-sheet__row-action settings-sheet__row-action--quiet"
                      onClick={() => setConfirming(true)}
                    >
                      Regenerar
                    </button>
                  </span>
                </div>
              )}

              <button
                type="button"
                className="settings-sheet__row settings-sheet__row--button"
                onClick={() => openShortcutImport()}
              >
                <span className="settings-sheet__row-text">
                  <span className="settings-sheet__row-label">
                    Añadir el atajo a Shortcuts
                  </span>
                </span>
                <ChevronRight
                  className="settings-sheet__row-chevron"
                  size={16}
                  aria-hidden="true"
                />
              </button>
            </section>
          )}

          <section className="settings-sheet__block">
            <h2 className="settings-sheet__block-title">La app</h2>
            {showInstallRow &&
              (isInstallable ? (
                <button
                  type="button"
                  ref={(el) => {
                    installRef.current = el
                  }}
                  className="settings-sheet__row settings-sheet__row--button"
                  onClick={() => void promptInstall()}
                >
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-label">
                      Instalar en la pantalla de inicio
                    </span>
                  </span>
                  <ChevronRight
                    className="settings-sheet__row-chevron"
                    size={16}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                // Safari offers no install prompt, so this row is the
                // instruction rather than a control. It is focusable because
                // the notifications row sends people here.
                <div
                  className="settings-sheet__row"
                  ref={(el) => {
                    installRef.current = el
                  }}
                  tabIndex={-1}
                >
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-label">
                      Instalar en la pantalla de inicio
                    </span>
                    <span className="settings-sheet__row-sub">
                      Compartir → Añadir a pantalla de inicio
                    </span>
                  </span>
                </div>
              ))}
            <button
              type="button"
              className="settings-sheet__row settings-sheet__row--button"
              onClick={onOpenFeedback}
            >
              <span className="settings-sheet__row-text">
                <span className="settings-sheet__row-label">
                  Contar algo al equipo
                </span>
              </span>
              <ChevronRight
                className="settings-sheet__row-chevron"
                size={16}
                aria-hidden="true"
              />
            </button>
          </section>
        </div>

        <div className="settings-sheet__foot">
          <button
            type="button"
            className="settings-sheet__signout"
            onClick={onSignOut}
          >
            Salir de la cuenta
          </button>
          {/* What someone is asked for when something goes wrong, not a row. */}
          <span className="settings-sheet__version">v{APP_VERSION}</span>
        </div>
      </div>
    </>
  )
}
