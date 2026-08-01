import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnline, reportRequestOutcome, subscribe } from './connectivity'

beforeEach(() => {
  reportRequestOutcome(true)
})

describe('connectivity', () => {
  it('goes offline on the browser offline event', () => {
    window.dispatchEvent(new Event('offline'))
    expect(isOnline()).toBe(false)
  })

  it('comes back online on the browser online event', () => {
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    expect(isOnline()).toBe(true)
  })

  it('a failed request counts as offline evidence', () => {
    reportRequestOutcome(false)
    expect(isOnline()).toBe(false)
  })

  it('a successful request overrides a stale offline event', () => {
    // One bar of signal in reverse: the browser says offline but a request
    // got through. The request is the better evidence.
    window.dispatchEvent(new Event('offline'))
    reportRequestOutcome(true)
    expect(isOnline()).toBe(true)
  })

  it('notifies subscribers on change, not on every signal', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    reportRequestOutcome(true) // no change
    expect(listener).not.toHaveBeenCalled()

    reportRequestOutcome(false) // change
    reportRequestOutcome(false) // no change
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    reportRequestOutcome(true) // change, but unsubscribed
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
