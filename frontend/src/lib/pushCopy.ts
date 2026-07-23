export interface PushPayload {
  list_id: string
  list_name: string
  actor_name: string
  event: 'added' | 'purchased'
  item_name: string
  unseen_count?: string
}

export interface BuiltNotification {
  title: string
  body: string
  tag: string
  url: string
}

/**
 * The title is always the list name: with several shared lists, "which list"
 * is the first thing the reader needs. The tag is per list so notifications
 * from different lists collapse independently rather than replacing each other.
 *
 * DOM-free and WebWorker-safe on purpose: imported by both the app and the
 * service worker. Keep it free of `window`, `document` and Node APIs.
 */
export function buildNotification(payload: PushPayload): BuiltNotification {
  const count = Number(payload.unseen_count ?? '1') || 1
  const verb = payload.event === 'purchased' ? 'compró' : 'añadió'
  const single = `${payload.actor_name} ${verb} ${payload.item_name}`

  let body: string
  if (count <= 1) body = single
  else if (count === 2) body = `${single} y 1 cambio más`
  else body = `${count} cambios en tu lista`

  return {
    title: payload.list_name,
    body,
    tag: `list-${payload.list_id}`,
    url: `/lists/${payload.list_id}`,
  }
}
