const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch(
  getToken: () => Promise<string>,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  if (res.status === 204) return null
  return res.json()
}

export function syncUser(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/auth/sync', { method: 'POST' })
}

export function getLists(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/lists')
}

export function createList(getToken: () => Promise<string>, name: string) {
  return apiFetch(getToken, '/lists', { method: 'POST', body: JSON.stringify({ name }) })
}

export function getListItems(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}/items`)
}

export function getListMembers(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}/members`)
}

export function getListUpdatedAt(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}/updated-at`)
}

export function createItem(
  getToken: () => Promise<string>,
  listId: string,
  payload: {
    name: string
    quantity?: string | null
    brand?: string | null
    variety?: string | null
    store?: string | null
  },
) {
  return apiFetch(getToken, `/lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateItem(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  patch: Partial<{
    purchased: boolean
    name: string
    quantity: string | null
    brand: string | null
    variety: string | null
    store: string | null
  }>,
) {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function getSuggestions(getToken: () => Promise<string>, q: string) {
  return apiFetch(getToken, `/suggestions?q=${encodeURIComponent(q)}`)
}
