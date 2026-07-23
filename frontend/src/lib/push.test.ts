import { beforeEach, describe, expect, it, vi } from 'vitest'

// Importing ./push pulls in ./firebase, which calls initializeApp at load.
// Replace it wholesale: push.ts only imports messagingPromise from it, so the
// importOriginal gotcha does not apply here.
vi.mock('./firebase', () => ({
  messagingPromise: Promise.resolve(null),
}))

import { canReceivePush, permissionState } from './push'

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
  it('reports unsupported when Notification is absent', () => {
    vi.stubGlobal('Notification', undefined)
    expect(permissionState()).toBe('unsupported')
  })

  it('reflects the browser permission', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    expect(permissionState()).toBe('denied')
  })
})
