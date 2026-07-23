import { describe, expect, it } from 'vitest'
import { buildNotification, type PushPayload } from './pushCopy'

const base: PushPayload = {
  list_id: 'l1',
  list_name: '🏠 Casa',
  actor_name: 'Ana',
  event: 'added',
  item_name: 'leche',
  unseen_count: '1',
}

describe('buildNotification', () => {
  it('names the item when there is a single change', () => {
    const n = buildNotification(base)
    expect(n.title).toBe('🏠 Casa')
    expect(n.body).toBe('Ana añadió leche')
  })

  it('uses compró for purchases', () => {
    expect(buildNotification({ ...base, event: 'purchased' }).body).toBe(
      'Ana compró leche',
    )
  })

  it('adds a singular tail at two changes', () => {
    expect(buildNotification({ ...base, unseen_count: '2' }).body).toBe(
      'Ana añadió leche y 1 cambio más',
    )
  })

  it('summarises at three or more', () => {
    expect(buildNotification({ ...base, unseen_count: '6' }).body).toBe(
      '6 cambios en tu lista',
    )
  })

  it('tags per list so lists collapse independently', () => {
    expect(buildNotification(base).tag).toBe('list-l1')
    expect(buildNotification({ ...base, list_id: 'l2' }).tag).toBe('list-l2')
  })

  it('routes to the list', () => {
    expect(buildNotification(base).url).toBe('/lists/l1')
  })

  it('treats a missing count as a single change', () => {
    const withoutCount: PushPayload = { ...base }
    delete withoutCount.unseen_count
    expect(buildNotification(withoutCount).body).toBe('Ana añadió leche')
  })
})
