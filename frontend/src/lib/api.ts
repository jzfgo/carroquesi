import type { BarcodeRead, DueSuggestion, PriceEntry, PriceHistoryResponse, Suggestion } from '../types'

const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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

export function createList(getToken: () => Promise<string>, payload: { name: string; emoji: string }) {
  return apiFetch(getToken, '/lists', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateList(
  getToken: () => Promise<string>,
  listId: string,
  patch: { name?: string; emoji?: string | null },
) {
  return apiFetch(getToken, `/lists/${listId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteList(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}`, { method: 'DELETE' })
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
    stores?: string[]
    ean?: string | null
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
    stores: string[]
  }>,
) {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteItem(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}`, { method: 'DELETE' })
}

export async function getSuggestions(getToken: () => Promise<string>, q: string): Promise<Suggestion[]> {
  return apiFetch(getToken, `/suggestions?q=${encodeURIComponent(q)}`) as Promise<Suggestion[]>
}

export async function getDueSuggestions(
  getToken: () => Promise<string>,
  listId: string,
): Promise<DueSuggestion[]> {
  return apiFetch(getToken, `/lists/${listId}/due-suggestions`) as Promise<DueSuggestion[]>
}

export async function getBarcode(
  getToken: () => Promise<string>,
  ean: string,
): Promise<BarcodeRead> {
  return apiFetch(getToken, `/barcode/${ean}`) as Promise<BarcodeRead>
}

export function removeMember(
  getToken: () => Promise<string>,
  listId: string,
  userId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/members/${userId}`, { method: 'DELETE' })
}

export function createOpenInvite(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}/invites`, { method: 'POST' })
}

export async function getInvitePreview(inviteId: string): Promise<{
  id: string
  list_name: string
  list_emoji: string | null
  invited_by_name: string | null
}> {
  const res = await fetch(`${BASE}/invites/${inviteId}`)
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<{
    id: string
    list_name: string
    list_emoji: string | null
    invited_by_name: string | null
  }>
}

export function acceptInvite(
  getToken: () => Promise<string>,
  inviteId: string,
): Promise<{ list_id: string }> {
  return apiFetch(getToken, `/invites/${inviteId}/accept`, { method: 'POST' }) as Promise<{ list_id: string }>
}

export function getPriceHistory(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  scope: 'this_list' | 'my_lists' | 'all',
): Promise<PriceHistoryResponse> {
  return apiFetch(
    getToken,
    `/lists/${listId}/items/${itemId}/prices?scope=${scope}`,
  ) as Promise<PriceHistoryResponse>
}

export function logPrice(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  payload: { amount: number; price_per: 'KILOGRAM' | null; store: string | null },
): Promise<PriceEntry> {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}/prices`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<PriceEntry>
}
