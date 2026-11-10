import { Mail } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ApiError, getReportPref, setReportPref } from '../lib/api'
import { isOnline } from '../lib/connectivity'
import { Toast } from './Toast'

interface Props {
  listId: string
  /** A 403/404 answer: the list may be gone, or no longer the caller's. */
  onListSuspect?: () => void
}

/** The owner's "Informe mensual" switch. It writes
    the same opt-out the email's unsubscribe link does, so it is also the way
    back after an unsubscribe. The setting is personal: no list read changes. */
export function ReportSwitchRow({ listId, onListSuspect }: Props) {
  const { getToken } = useAuth()
  // null while the first read is in flight, or after it failed.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Callers pass a fresh arrow each render; reading it through a ref keeps
  // the read below from running again on every render.
  const suspectRef = useRef(onListSuspect)
  useEffect(() => {
    suspectRef.current = onListSuspect
  }, [onListSuspect])

  useEffect(() => {
    let live = true
    getReportPref(getToken, listId)
      .then((pref) => {
        if (live) setEnabled(pref.enabled)
      })
      .catch((err: unknown) => {
        if (!live) return
        if (isGone(err)) suspectRef.current?.()
        // Say why the switch stays dimmed. Reopening the sheet reads again.
        else setToast('No se pudo cargar el informe mensual')
      })
    return () => {
      live = false
    }
  }, [getToken, listId])

  async function toggle() {
    if (enabled === null || saving) return
    if (!isOnline()) {
      setToast('No disponible sin conexión')
      return
    }
    const next = !enabled
    setEnabled(next)
    setSaving(true)
    try {
      await setReportPref(getToken, listId, next)
    } catch (err) {
      setEnabled(!next)
      setToast('No se pudo guardar el informe mensual')
      if (isGone(err)) suspectRef.current?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="list-options__row list-options__row--tall">
      <Mail size={18} className="list-options__row-icon" aria-hidden />
      <span className="list-options__row-text">
        <span className="list-options__row-label">Informe mensual</span>
        <span className="list-options__row-sub">
          Por email, a principios de cada mes
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled === true}
        aria-label="Informe mensual"
        disabled={enabled === null}
        className={`list-options__switch${enabled ? ' list-options__switch--on' : ''}`}
        onClick={() => void toggle()}
      >
        <span className="list-options__switch-knob" aria-hidden />
      </button>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

function isGone(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 403 || err.status === 404)
}
