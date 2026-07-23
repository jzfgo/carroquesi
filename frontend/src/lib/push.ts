import { deleteToken, getToken as getFcmToken } from 'firebase/messaging'
import { deletePushToken, registerPushToken } from './api'
import { FIREBASE_VAPID_KEY } from './environment'
import { messagingPromise } from './firebase'

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

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
  const messaging = await messagingPromise
  if (!messaging || !FIREBASE_VAPID_KEY) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  const token = await getFcmToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) return null

  await registerPushToken(getAuthToken, token)
  return token
}

/** Turning off deletes this device's token: token presence is the preference. */
export async function disablePush(
  getAuthToken: () => Promise<string>,
): Promise<void> {
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
 * Re-register on every app start: FCM rotates tokens silently, and the backend
 * upsert is idempotent.
 *
 * Also handles permission revoked out-of-band. A user who turns notifications
 * off in OS settings leaves a live token in our database that will never
 * deliver, so drop it rather than sending into the void.
 */
export async function syncPushToken(
  getAuthToken: () => Promise<string>,
): Promise<void> {
  if (permissionState() === 'denied') {
    await disablePush(getAuthToken).catch(() => undefined)
    return
  }
  if (permissionState() !== 'granted') return
  const messaging = await messagingPromise
  if (!messaging || !FIREBASE_VAPID_KEY) return
  const registration = await navigator.serviceWorker.ready
  const token = await getFcmToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  }).catch(() => null)
  if (token) await registerPushToken(getAuthToken, token).catch(() => undefined)
}
