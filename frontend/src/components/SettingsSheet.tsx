import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'
import { useApplePlatform } from '../hooks/useApplePlatform'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { issueApiKey, openShortcutImport, regenerateApiKey } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { FLAGS } from '../lib/featureFlags'
import {
  canReceivePush,
  disablePush,
  enablePush,
  isPushEnabled,
  permissionState,
} from '../lib/push'
import {
  getPreference,
  setPreference,
  type ThemePreference,
} from '../lib/theme'
import './SettingsSheet.css'
import { Sheet, type SheetHandle } from './Sheet'

interface Props {
  /** Name of the user's default list — where Siri-added items land. */
  defaultListName: string | null
  /** The feedback row: the parent closes this sheet and opens FeedbackSheet. */
  onFeedback: () => void
  onToast: (message: string) => void
  onClose: () => void
}

const MASK = '••••••••••••••••'

// The 34a segment. Three options and not a switch, because «like the system»
// is what most people want and a two-state switch cannot say it.
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
]

/**
 * The 23a settings sheet: identity header, then the blocks — Aspecto first
 * (the 34a switcher, leading as on the artboard), Avisos, Atajo de Siri,
 * La app, and the sign-out footer.
 */
export function SettingsSheet({
  defaultListName,
  onFeedback,
  onToast,
  onClose,
}: Props) {
  const { user, getToken, signOut } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const isApplePlatform = useApplePlatform()
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()
  const sheetRef = useRef<SheetHandle>(null)

  const [themePref, setThemePref] = useState<ThemePreference>(() =>
    getPreference(),
  )
  // Roving focus for the radiogroup: arrow keys select AND move focus, so the
  // focused segment must be reachable imperatively.
  const themeRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectTheme = (index: number) => {
    const { value } = THEME_OPTIONS[index]
    setThemePref(value)
    setPreference(value)
  }

  const onThemeKeyDown = (event: React.KeyboardEvent, index: number) => {
    let delta: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') delta = 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') delta = -1
    else return
    event.preventDefault()
    const next = (index + delta + THEME_OPTIONS.length) % THEME_OPTIONS.length
    selectTheme(next)
    themeRefs.current[next]?.focus()
  }

  const [pushOn, setPushOn] = useState(() => isPushEnabled())
  // Permission is held in state rather than read inline in JSX. A denial does
  // not change isPushEnabled() -- it is false before and after -- so
  // setPushOn alone is a same-value update, and React may skip the re-render
  // that would reveal the blocked message. This value genuinely changes
  // ('default' -> 'denied'), so it cannot hit that bailout.
  const [permission, setPermission] = useState(() => permissionState())
  const [howOpen, setHowOpen] = useState(false)
  // Points at the install row so the Avisos row on an uninstalled iPhone can
  // lead there instead of repeating its instructions.
  const installRowRef = useRef<HTMLElement | null>(null)
  const setInstallRowRef = (el: HTMLElement | null) => {
    installRowRef.current = el
  }

  // The key row is lazy: the sheet opens instantly and the (idempotent) key
  // issuance resolves into it. A returning user gets no plaintext back — the
  // stored hash cannot be re-displayed — so shownKey stays null and only
  // Regenerar can produce a copyable key again.
  const hasSiriTarget = defaultListName !== null
  const [shownKey, setShownKey] = useState<string | null>(null)
  // Starts true exactly when the effect below will fetch, so the loading row
  // shows from the first paint without a setState inside the effect body.
  const [keyLoading, setKeyLoading] = useState(isApplePlatform && hasSiriTarget)
  const [confirming, setConfirming] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    // Without a default list the shortcut's list_id="default" would only 404
    // (mirrors the backend guard on POST /account/api-key), so the block shows
    // the nudge row instead and no key is issued.
    if (!isApplePlatform || !hasSiriTarget) return
    let cancelled = false
    issueApiKey(getToken)
      .then(({ key }) => {
        if (!cancelled) setShownKey(key)
      })
      .catch(() => {
        if (!cancelled)
          onToast('No se pudo preparar el atajo de Siri. Inténtalo de nuevo.')
      })
      .finally(() => {
        if (!cancelled) setKeyLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isApplePlatform, hasSiriTarget, getToken, onToast])

  const cancelConfirm = () => {
    if (!regenerating) setConfirming(false)
  }

  async function handleConfirmRegenerate() {
    setRegenerating(true)
    try {
      const { key } = await regenerateApiKey(getToken)
      setShownKey(key)
    } catch {
      onToast('No se pudo regenerar la clave. Inténtalo de nuevo.')
    }
    setRegenerating(false)
    setConfirming(false)
  }

  async function handleCopyKey() {
    if (!shownKey) return
    const ok = await copyToClipboard(shownKey)
    onToast(ok ? 'Clave copiada' : 'No se pudo copiar la clave')
  }

  // An uninstalled iPhone cannot receive push, but hiding the block there
  // would silently drop the one platform that needs an explanation. Only a
  // browser with no Notification API on a non-Apple device truly has nothing
  // to say.
  const showAvisos =
    isEnabled(FLAGS.PUSH_NOTIFICATIONS) &&
    (canReceivePush({ isIOS, isInstalled }) || (isIOS && !isInstalled))
  const showInstallRow = (isInstallable || isIOS) && !isInstalled

  return (
    <Sheet
      ref={sheetRef}
      className="settings-sheet"
      label={confirming ? 'Regenerar clave' : 'Ajustes'}
      onClose={onClose}
      // In the confirm sub-state, dismissing (swipe / scrim / Escape) goes
      // back to the settings view rather than closing the whole sheet.
      onDismiss={confirming ? cancelConfirm : undefined}
    >
      {confirming ? (
        <div className="settings-sheet__confirm">
          <h2 className="settings-sheet__confirm-title">Regenerar clave</h2>
          <p className="settings-sheet__confirm-warning">
            Se invalidará tu clave actual y tendrás que pegar la nueva en el
            atajo.
          </p>
          <button
            type="button"
            className="settings-sheet__confirm-btn"
            disabled={regenerating}
            onClick={() => void handleConfirmRegenerate()}
          >
            {regenerating ? 'Regenerando…' : 'Sí, regenerar'}
          </button>
          <button
            type="button"
            className="settings-sheet__cancel-btn"
            disabled={regenerating}
            onClick={cancelConfirm}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <header className="settings-sheet__identity">
            <span className="settings-sheet__avatar" aria-hidden="true">
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt="" />
              ) : (
                <span>{user?.displayName?.[0] ?? '?'}</span>
              )}
            </span>
            <span className="settings-sheet__who">
              <span className="settings-sheet__name">{user?.displayName}</span>
              <span className="settings-sheet__email">{user?.email}</span>
            </span>
          </header>

          <section className="settings-sheet__block">
            <h3 className="settings-sheet__eyebrow">Aspecto</h3>
            <div
              role="radiogroup"
              aria-label="Aspecto"
              className="settings-sheet__segment"
            >
              {THEME_OPTIONS.map(({ value, label }, index) => (
                <button
                  key={value}
                  ref={(el) => {
                    themeRefs.current[index] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={themePref === value}
                  tabIndex={themePref === value ? 0 : -1}
                  className="settings-sheet__segment-btn"
                  onClick={() => selectTheme(index)}
                  onKeyDown={(event) => onThemeKeyDown(event, index)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {showAvisos && (
            <section className="settings-sheet__block">
              <h3 className="settings-sheet__eyebrow">Avisos</h3>
              {isIOS && !isInstalled ? (
                // No switch: there is nothing to activate until the app is
                // installed. The chevron leads to the install row below
                // instead of repeating its instructions here.
                <button
                  type="button"
                  className="settings-sheet__row settings-sheet__row--action"
                  onClick={() =>
                    installRowRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    })
                  }
                >
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-title">
                      Avisos en este dispositivo
                    </span>
                    <span className="settings-sheet__row-subtitle">
                      En iPhone hay que instalar la app en la pantalla de inicio
                    </span>
                  </span>
                  <ChevronRight
                    size={14}
                    className="settings-sheet__chevron"
                    aria-hidden="true"
                  />
                </button>
              ) : permission === 'denied' ? (
                // Once permission is denied the browser will not re-prompt, so
                // a switch here would call requestPermission(), return
                // immediately and change nothing — a control that looks
                // broken. The system holds the lock, and «Cómo» explains the
                // way out instead of offering a dead action.
                <>
                  <div className="settings-sheet__row">
                    <span className="settings-sheet__row-text">
                      <span className="settings-sheet__row-title">
                        Avisos en este dispositivo
                      </span>
                      <span className="settings-sheet__row-subtitle">
                        Bloqueados en los ajustes del sistema, no aquí
                      </span>
                    </span>
                    <button
                      type="button"
                      className="settings-sheet__inline-action"
                      aria-expanded={howOpen}
                      onClick={() => setHowOpen((open) => !open)}
                    >
                      Cómo
                    </button>
                  </div>
                  {howOpen && (
                    <p className="settings-sheet__how-text">
                      Actívalos en los ajustes de tu navegador para volver a
                      recibirlos.
                    </p>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushOn}
                  className="settings-sheet__row settings-sheet__row--action"
                  onClick={async () => {
                    // Reads back the real state rather than assuming success:
                    // the OS prompt can be denied, and on iOS that denial is
                    // permanent. enablePush must stay the first await — the
                    // permission request is its first statement, straight off
                    // this gesture, or WebKit drops the transient activation.
                    if (pushOn)
                      await disablePush(getToken).catch(() => undefined)
                    else await enablePush(getToken).catch(() => undefined)
                    setPushOn(isPushEnabled())

                    setPermission(permissionState())
                  }}
                >
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-title">
                      Avisos en este dispositivo
                    </span>
                    {/* The subtitle names what flipping the switch will do:
                        granted-but-off can re-enable without the system
                        asking again, and saying so removes the fear of
                        touching it. */}
                    <span className="settings-sheet__row-subtitle">
                      {pushOn
                        ? 'Cuando alguien añada o compre en tus listas'
                        : permission === 'granted'
                          ? 'Se vuelven a encender sin volver a preguntar'
                          : 'El sistema te lo preguntará una sola vez'}
                    </span>
                  </span>
                  <span className="settings-sheet__switch" aria-hidden="true">
                    <span className="settings-sheet__knob" />
                  </span>
                </button>
              )}
            </section>
          )}

          {isApplePlatform && (
            <section className="settings-sheet__block">
              <h3 className="settings-sheet__eyebrow">Atajo de Siri</h3>
              {hasSiriTarget ? (
                <>
                  <div className="settings-sheet__row">
                    <span className="settings-sheet__row-text">
                      <span className="settings-sheet__row-title">
                        Añade a «{defaultListName}»
                      </span>
                      <span className="settings-sheet__row-subtitle">
                        La lista predeterminada
                      </span>
                    </span>
                  </div>
                  <div className="settings-sheet__row">
                    <span className="settings-sheet__row-text">
                      <span className="settings-sheet__row-title">
                        Tu clave
                      </span>
                      {keyLoading ? (
                        <span className="settings-sheet__row-subtitle">
                          Cargando…
                        </span>
                      ) : (
                        <span className="settings-sheet__row-subtitle settings-sheet__row-subtitle--mono">
                          {MASK}
                        </span>
                      )}
                    </span>
                    {!keyLoading && (
                      <span className="settings-sheet__row-actions">
                        {shownKey && (
                          <button
                            type="button"
                            className="settings-sheet__inline-action"
                            onClick={() => void handleCopyKey()}
                          >
                            Copiar
                          </button>
                        )}
                        <button
                          type="button"
                          className="settings-sheet__inline-action settings-sheet__inline-action--neutral"
                          onClick={() => setConfirming(true)}
                        >
                          Regenerar
                        </button>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="settings-sheet__row settings-sheet__row--action"
                    onClick={() => openShortcutImport()}
                  >
                    <span className="settings-sheet__row-text">
                      <span className="settings-sheet__row-title">
                        Añadir el atajo a Shortcuts
                      </span>
                    </span>
                    <ChevronRight
                      size={14}
                      className="settings-sheet__chevron"
                      aria-hidden="true"
                    />
                  </button>
                </>
              ) : (
                <div className="settings-sheet__row">
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-title">
                      Añade a tu lista predeterminada
                    </span>
                    <span className="settings-sheet__row-subtitle">
                      Marca una lista como predeterminada para usar el atajo de
                      Siri
                    </span>
                  </span>
                </div>
              )}
            </section>
          )}

          <section className="settings-sheet__block">
            <h3 className="settings-sheet__eyebrow">La app</h3>
            {showInstallRow &&
              (isInstallable ? (
                <button
                  type="button"
                  ref={setInstallRowRef}
                  className="settings-sheet__row settings-sheet__row--action"
                  onClick={() => void promptInstall()}
                >
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-title">
                      Instalar en la pantalla de inicio
                    </span>
                  </span>
                  <ChevronRight
                    size={14}
                    className="settings-sheet__chevron"
                    aria-hidden="true"
                  />
                </button>
              ) : (
                // iOS has no install prompt to trigger — the row carries the
                // manual instruction instead of a dead action.
                <div ref={setInstallRowRef} className="settings-sheet__row">
                  <span className="settings-sheet__row-text">
                    <span className="settings-sheet__row-title">
                      Instalar en la pantalla de inicio
                    </span>
                    <span className="settings-sheet__row-subtitle">
                      Compartir → Añadir a pantalla de inicio
                    </span>
                  </span>
                </div>
              ))}
            <button
              type="button"
              className="settings-sheet__row settings-sheet__row--action"
              onClick={onFeedback}
            >
              <span className="settings-sheet__row-text">
                <span className="settings-sheet__row-title">
                  Contar algo al equipo
                </span>
              </span>
              <ChevronRight
                size={14}
                className="settings-sheet__chevron"
                aria-hidden="true"
              />
            </button>
          </section>

          {/* A per-user «Escaneo de tickets» toggle is planned to sit here,
              as its own block above the footer. */}

          <footer className="settings-sheet__footer">
            <button
              type="button"
              className="settings-sheet__signout"
              onClick={() => void signOut()}
            >
              Salir de la cuenta
            </button>
            <span className="settings-sheet__version">v{__APP_VERSION__}</span>
          </footer>
        </>
      )}
    </Sheet>
  )
}
