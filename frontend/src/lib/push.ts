import { deleteToken, getToken as getFcmToken } from 'firebase/messaging'
import { deletePushToken, registerPushToken } from './api'
import { FIREBASE_VAPID_KEY } from './environment'
import { messagingPromise } from './firebase'

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

// Per-device mirror of "this device opted in". Necessary because an in-app
// disable removes our token but leaves OS permission 'granted', so permission
// alone cannot tell an opted-in device from an opted-out one on the next start.
const DEVICE_SUBSCRIBED_KEY = 'push-device-subscribed'

interface PlatformContext {
  isIOS: boolean
  isInstalled: boolean
}

/**
 * iOS delivers Web Push only to a home-screen-installed web app. In Safari
 * proper the APIs are absent, so asking is impossible rather than merely futile.
 */
export function canReceivePush({
  isIOS,
  isInstalled,
}: PlatformContext): boolean {
  if (typeof Notification === 'undefined') return false
  if (isIOS && !isInstalled) return false
  return true
}

export function permissionState(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as PermissionState
}

/**
 * Must be called from a user gesture. On iOS this prompt can only ever be shown
 * once — a denial is origin-wide and permanent — so callers prime first.
 */
export async function enablePush(
  getAuthToken: () => Promise<string>,
): Promise<string | null> {
  // Request permission FIRST, straight off the user gesture. Any await before
  // Notification.requestPermission() risks WebKit dropping the transient
  // activation, and on iOS a denial is permanent per-origin — a bet with no
  // upside. The unsupported guard stays ahead of the prompt so iOS Safari
  // (no Notification API) bails cleanly instead of throwing ReferenceError.
  if (typeof Notification === 'undefined') return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const messaging = await messagingPromise
  if (!messaging || !FIREBASE_VAPID_KEY) return null

  const registration = await navigator.serviceWorker.ready
  const token = await getFcmToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) return null

  await registerPushToken(getAuthToken, token)
  // Record opt-in only after the backend accepted the token, so syncPushToken
  // refreshes it on later starts rather than treating this device as subscribed.
  localStorage.setItem(DEVICE_SUBSCRIBED_KEY, '1')
  return token
}

/** Turning off deletes this device's token: token presence is the preference. */
export async function disablePush(
  getAuthToken: () => Promise<string>,
): Promise<void> {
  // Clear the local opt-in first: the intent is "off" regardless of whether we
  // can reach FCM to delete the token. Otherwise a failed delete would leave
  // syncPushToken believing the device is still subscribed and re-register it.
  localStorage.removeItem(DEVICE_SUBSCRIBED_KEY)
  const messaging = await messagingPromise
  if (!messaging) return
  const registration = await navigator.serviceWorker.ready
  const token = await getFcmToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY ?? '',
    serviceWorkerRegistration: registration,
  }).catch(() => null)
  if (token) {
    await deletePushToken(getAuthToken, token).catch(() => undefined)
    await deleteToken(messaging).catch(() => undefined)
  }
}

/**
 * Refresh this device's token on app start: FCM rotates tokens silently and the
 * backend upsert is idempotent. Gated on the device opt-in flag, so it never
 * re-creates a token the user removed in-app — permission stays 'granted' after
 * an in-app disable, so that flag is the only thing distinguishing the two.
 *
 * If permission was revoked out-of-band (OS settings), clear the opt-in. We
 * cannot delete the backend row here — getToken rejects once permission is
 * denied — so it is left for the send path's typed-verdict pruning to remove on
 * its first failed delivery.
 */
export async function syncPushToken(
  getAuthToken: () => Promise<string>,
): Promise<void> {
  if (permissionState() === 'denied') {
    await disablePush(getAuthToken).catch(() => undefined)
    return
  }
  if (permissionState() !== 'granted') return
  if (localStorage.getItem(DEVICE_SUBSCRIBED_KEY) !== '1') return
  const messaging = await messagingPromise
  if (!messaging || !FIREBASE_VAPID_KEY) return
  const registration = await navigator.serviceWorker.ready
  const token = await getFcmToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  }).catch(() => null)
  if (token) await registerPushToken(getAuthToken, token).catch(() => undefined)
}
