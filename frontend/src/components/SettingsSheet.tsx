import { ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { AuthUser } from '../contexts/AuthContext'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { issueApiKey, openShortcutImport, regenerateApiKey } from '../lib/api'
import { copyToClipboard, copyWhenReady } from '../lib/clipboard'
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

/**
 * The line under the switch.
 *
 * `unavailable` is the one state that covers three different devices, and they
 * need three different sentences: an iPhone that can install its way out, an
 * iPhone already installed and simply too old for Web Push, and a browser that
 * is neither. Telling the second one to install is telling it to do what it has
 * already done.
 */
function pushSubtitle(
  state: PushState,
  { isIOS, isInstalled }: { isIOS: boolean; isInstalled: boolean },
): string {
  if (state !== 'unavailable') return PUSH_SUBTITLE[state]
  if (!isIOS) return 'Este navegador no puede recibir avisos'
  return isInstalled
    ? 'Tu iPhone necesita una versión más reciente de iOS'
    : 'En iPhone hay que instalar la app en la pantalla de inicio'
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
  // A returning user's key is unrecoverable, and the server says so by handing
  // back null. Remembering that turns every later tap into a toast instead of
  // another request that can only give the same answer.
  const [keyHidden, setKeyHidden] = useState(false)
  // The request in flight, so a second tap joins it rather than starting its
  // own. State cannot do this job: both taps read the same render.
  const issuingRef = useRef<ReturnType<typeof issueApiKey> | null>(null)
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

  /**
   * Like the switch above, this must not await before it copies.
   *
   * The key does not exist until the first tap asks for it, so the copy has to
   * wait for a round trip — and WebKit takes the gesture away across that await,
   * which would refuse the write on Safari and iOS, the only platforms this
   * block is shown on. So the clipboard call starts on the tap and the key
   * arrives inside it.
   */
  function handleCopyKey() {
    if (!defaultListName) {
      onToast('Marca una lista como predeterminada para usar el atajo de Siri')
      return
    }
    const report = (ok: boolean) =>
      onToast(ok ? 'Clave copiada' : 'No se pudo copiar la clave')

    if (shownKey) {
      void copyToClipboard(shownKey).then(report)
      return
    }
    if (keyHidden) {
      onToast('Tu clave está oculta. Regenérala para obtener una nueva.')
      return
    }

    // Idempotent, and only ever hands back plaintext on first issuance: what
    // the server keeps is a hash. A returning user gets null and is told to
    // regenerate.
    //
    // Which is why two taps must not become two requests. The server can only
    // hand the plaintext to one of them, and the loser gets the null meant for
    // a returning user — landing last, it would wipe the reveal the winner just
    // made and latch the row shut. Joining the same promise also keeps the
    // gesture, because the second tap still reaches the clipboard call.
    const joining = issuingRef.current !== null
    const issued = (issuingRef.current ??= issueApiKey(getToken))

    // Every tap copies — that is what keeps the second tap's gesture — but only
    // the tap that made the request speaks. Two of these would say «Clave
    // copiada» twice, and worse on Safari: an engine that refuses the second
    // write leaves its fallback running after an await with the gesture gone,
    // so the sheet would report copied and not copied at once.
    const copied = copyWhenReady(
      issued.then(({ key }) => {
        if (!key) throw new Error('no plaintext key to copy')
        return key
      }),
    )
    if (joining) return

    // Whether this answer still matters. Clearing the ref does not detach a
    // handler already registered on the old promise, so a regenerate that
    // finished while this was in flight would otherwise be undone by it —
    // erasing a key issued a second ago, or showing one it just revoked.
    const current = () => issuingRef.current === issued

    void issued.then(
      async ({ key }) => {
        if (!current()) return
        setShownKey(key)
        if (!key) {
          setKeyHidden(true)
          onToast('Tu clave está oculta. Regenérala para obtener una nueva.')
          return
        }
        report(await copied)
      },
      () => {
        if (!current()) return
        // Let the next tap try again rather than joining a request that failed.
        issuingRef.current = null
        onToast('No se pudo preparar el atajo de Siri. Inténtalo de nuevo.')
      },
    )
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const { key } = await regenerateApiKey(getToken)
      setShownKey(key)
      setKeyHidden(false)
      // The old request's answer is about a key that no longer exists.
      issuingRef.current = null
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
                    {pushSubtitle(state, { isIOS, isInstalled })}
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
                    aria-controls={`${id}-how`}
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
              {/* Present whenever the row is blocked and hidden until asked:
                  the button names this element, and a name that points at
                  something not in the document points at nothing. */}
              {state === 'denied' && (
                <p
                  className="settings-sheet__note"
                  id={`${id}-how`}
                  hidden={!howOpen}
                >
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
                      onClick={handleCopyKey}
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
