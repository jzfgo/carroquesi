import { describe, expect, it } from 'vitest'
import { isRetryable, itemRefusal, refusalMessage } from './refusalCopy'
import { apiError } from './testApiError'

/**
 * These moved here with `isRetryable` when the offline queue was deleted.
 * They used to live in `queueCopy.test.ts`, which went with its module — the
 * rule outlived the machinery it was written for, and a rule with no direct
 * test is one that drifts on the next refactor.
 */
describe('isRetryable', () => {
  // A status that states a fact about the data will say the same thing to the
  // same request, so the line is drawn without a control known to fail.
  it('refuses a retry that can never end differently', () => {
    for (const status of [400, 404, 409, 422]) {
      expect(isRetryable(status)).toBe(false)
    }
  })

  it('offers one where the answer can change', () => {
    for (const status of [401, 408, 429, 500, 503]) {
      expect(isRetryable(status)).toBe(true)
    }
  })

  // 401 and 403 look like one family and are not. A 401 is answered by the
  // next call carrying a fresh token; every 403 this backend raises is a
  // standing fact about the caller — not a member, not the owner, not an
  // admin, on the waitlist, the flag off, somebody else's invite. Being
  // removed from a list would otherwise put a «Reintentar» on every write.
  it('refuses one on a permission that asking again will not change', () => {
    expect(isRetryable(403)).toBe(false)
    expect(isRetryable(401)).toBe(true)
  })

  /**
   * No HTTP answer to read — a failure on this side. Not knowing why is not
   * the same as knowing it can never work.
   *
   * This case carries more weight than it did. It used to mean «the queue
   * will try again»; now it is the status a write gets when the network drops
   * mid-request, and the *Reintentar* it earns is the only way back to it.
   */
  it('offers one when there was no answer at all', () => {
    expect(isRetryable(0)).toBe(true)
  })
})

describe('refusalMessage', () => {
  // Scoped per status, not per call site: a 403 is about the list and is true
  // of every write, whatever it was trying to do.
  it('names the list for a permission refusal', () => {
    expect(refusalMessage(apiError(403, 'no'), 'fallback')).toBe(
      'Sin permiso en esa lista',
    )
  })

  it('falls back for anything it has no sentence for', () => {
    expect(refusalMessage(apiError(500, 'no'), 'No se pudo guardar')).toBe(
      'No se pudo guardar',
    )
    expect(refusalMessage(new TypeError('offline'), 'No se pudo guardar')).toBe(
      'No se pudo guardar',
    )
  })

  /**
   * The 404 is deliberately absent here. On an add the missing thing is the
   * *list*, not the product, so a sentence about a product would be false —
   * which is why only `itemRefusal` says it.
   */
  it('says nothing about a 404, because it cannot know what was missing', () => {
    expect(refusalMessage(apiError(404, 'no'), 'fallback')).toBe('fallback')
  })
})

describe('itemRefusal', () => {
  it('adds the 404 only a write naming a product can say', () => {
    expect(itemRefusal(apiError(404, 'no'), 'fallback')).toBe(
      'El producto ya no existe',
    )
  })

  it('keeps the list-scoped 403 it inherits', () => {
    expect(itemRefusal(apiError(403, 'no'), 'fallback')).toBe(
      'Sin permiso en esa lista',
    )
  })
})
