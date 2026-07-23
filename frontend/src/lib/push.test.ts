import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A truthy messaging stub so the lifecycle functions run past their
// `if (!messaging) return` guard — the earlier null mock short-circuited every
// one of them, leaving enablePush/disablePush/syncPushToken untested.
// vi.hoisted because vi.mock factories are hoisted above top-level consts.
const { fakeMessaging } = vi.hoisted(() => ({
  fakeMessaging: { __brand: 'messaging' as const },
}))

vi.mock('./firebase', () => ({
  messagingPromise: Promise.resolve(fakeMessaging),
}))
vi.mock('./environment', () => ({ FIREBASE_VAPID_KEY: 'vapid-key' }))
vi.mock('firebase/messaging', () => ({
  getToken: vi.fn(),
  deleteToken: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('./api', () => ({
  registerPushToken: vi.fn(() => Promise.resolve(null)),
  deletePushToken: vi.fn(() => Promise.resolve(null)),
}))

import { deleteToken, getToken } from 'firebase/messaging'
import { deletePushToken, registerPushToken } from './api'
import {
  canReceivePush,
  disablePush,
  enablePush,
  permissionState,
  syncPushToken,
} from './push'

const SUBSCRIBED_KEY = 'push-device-subscribed'
const getAuthToken = () => Promise.resolve('auth')

describe('canReceivePush', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false when the browser has no Notification API', () => {
    vi.stubGlobal('Notification', undefined)
    expect(canReceivePush({ isIOS: false, isInstalled: false })).toBe(false)
  })

  it('is false on iOS outside a home-screen install', () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    expect(canReceivePush({ isIOS: true, isInstalled: false })).toBe(false)
  })

  it('is true on iOS once installed', () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    expect(canReceivePush({ isIOS: true, isInstalled: true })).toBe(true)
  })

  it('is true in a desktop or Android browser without install', () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    expect(canReceivePush({ isIOS: false, isInstalled: false })).toBe(true)
  })
})

describe('permissionState', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports unsupported when Notification is absent', () => {
    vi.stubGlobal('Notification', undefined)
    expect(permissionState()).toBe('unsupported')
  })

  it('reflects the browser permission', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    expect(permissionState()).toBe('denied')
  })
})

describe('token lifecycle', () => {
  let requestPermission: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    requestPermission = vi.fn(() => Promise.resolve('granted'))
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ scope: '/' }) },
      configurable: true,
    })
    ;(getToken as Mock).mockResolvedValue('fcm-tok')
  })

  it('enablePush requests permission before ever fetching a token', async () => {
    const token = await enablePush(getAuthToken)

    expect(token).toBe('fcm-tok')
    // The gesture-critical ordering: on iOS an await before the prompt can drop
    // transient activation, and a denial is permanent.
    expect(requestPermission.mock.invocationCallOrder[0]).toBeLessThan(
      (getToken as Mock).mock.invocationCallOrder[0],
    )
    expect(registerPushToken).toHaveBeenCalledWith(getAuthToken, 'fcm-tok')
    expect(localStorage.getItem(SUBSCRIBED_KEY)).toBe('1')
  })

  it('enablePush stops at a denied prompt without fetching a token', async () => {
    requestPermission.mockResolvedValue('denied')

    const token = await enablePush(getAuthToken)

    expect(token).toBeNull()
    expect(getToken).not.toHaveBeenCalled()
    expect(registerPushToken).not.toHaveBeenCalled()
    expect(localStorage.getItem(SUBSCRIBED_KEY)).toBeNull()
  })

  it('enablePush bails cleanly when Notification is unavailable', async () => {
    vi.stubGlobal('Notification', undefined)
    await expect(enablePush(getAuthToken)).resolves.toBeNull()
    expect(getToken).not.toHaveBeenCalled()
  })

  it('disablePush deletes the token and clears the opt-in', async () => {
    localStorage.setItem(SUBSCRIBED_KEY, '1')

    await disablePush(getAuthToken)

    expect(deletePushToken).toHaveBeenCalledWith(getAuthToken, 'fcm-tok')
    expect(deleteToken).toHaveBeenCalled()
    expect(localStorage.getItem(SUBSCRIBED_KEY)).toBeNull()
  })

  it('disablePush clears the opt-in even when the token lookup fails', async () => {
    localStorage.setItem(SUBSCRIBED_KEY, '1')
    ;(getToken as Mock).mockRejectedValue(new Error('permission blocked'))

    await disablePush(getAuthToken)

    expect(localStorage.getItem(SUBSCRIBED_KEY)).toBeNull()
    expect(deletePushToken).not.toHaveBeenCalled()
  })

  it('syncPushToken refreshes a token this device opted into', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission })
    localStorage.setItem(SUBSCRIBED_KEY, '1')
    ;(getToken as Mock).mockResolvedValue('rotated-tok')

    await syncPushToken(getAuthToken)

    expect(registerPushToken).toHaveBeenCalledWith(getAuthToken, 'rotated-tok')
  })

  it('syncPushToken does NOT resurrect a token the user turned off', async () => {
    // The resurrection bug: an in-app disable leaves OS permission 'granted', so
    // without the opt-in guard this would re-register the just-deleted token.
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission })
    // No SUBSCRIBED_KEY set.

    await syncPushToken(getAuthToken)

    expect(getToken).not.toHaveBeenCalled()
    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('syncPushToken clears the opt-in when permission was revoked out-of-band', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission })
    localStorage.setItem(SUBSCRIBED_KEY, '1')
    ;(getToken as Mock).mockRejectedValue(new Error('permission blocked'))

    await syncPushToken(getAuthToken)

    expect(localStorage.getItem(SUBSCRIBED_KEY)).toBeNull()
    expect(registerPushToken).not.toHaveBeenCalled()
  })
})
