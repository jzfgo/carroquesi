import type {
  BarcodeRead,
  DueSuggestion,
  PriceEntry,
  PriceHistoryResponse,
  ReceiptPriceBatch,
  ReceiptScanRequest,
  ReceiptScanResult,
  Suggestion,
} from '../types'
import { BACKEND_URL, DEV_USER_ID } from './environment'

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
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      ...(DEV_USER_ID ? { 'X-Dev-User-Id': DEV_USER_ID } : {}),
    },
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  if (res.status === 204) return null
  return res.json()
}

export async function downloadShortcut(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/shortcuts/cqs.shortcut`)
  if (!res.ok) throw new ApiError(res.status, await res.text())
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'CarroQueSi.shortcut'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function regenerateApiKey(
  getToken: () => Promise<string>,
): Promise<{ key: string; regenerated_at: string }> {
  return apiFetch(getToken, '/account/api-key/regenerate', {
    method: 'POST',
  }) as Promise<{
    key: string
    regenerated_at: string
  }>
}

export function syncUser(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/auth/sync', { method: 'POST' })
}

export function getMe(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/users/me')
}

export function getLists(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/lists')
}

export function getList(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}`)
}

export function createList(
  getToken: () => Promise<string>,
  payload: { name: string; emoji: string },
) {
  return apiFetch(getToken, '/lists', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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

export function getListMembers(
  getToken: () => Promise<string>,
  listId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/members`)
}

export function getListUpdatedAt(
  getToken: () => Promise<string>,
  listId: string,
) {
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
    price?: number | null
    price_per?: 'KILOGRAM' | null
    price_store?: string | null
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
    purchased_quantity: string | null
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
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}`, {
    method: 'DELETE',
  })
}

export async function getSuggestions(
  getToken: () => Promise<string>,
  q: string,
): Promise<Suggestion[]> {
  return apiFetch(
    getToken,
    `/suggestions?q=${encodeURIComponent(q)}`,
  ) as Promise<Suggestion[]>
}

export async function getDueSuggestions(
  getToken: () => Promise<string>,
  listId: string,
): Promise<DueSuggestion[]> {
  return apiFetch(getToken, `/lists/${listId}/due-suggestions`) as Promise<
    DueSuggestion[]
  >
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
  return apiFetch(getToken, `/lists/${listId}/members/${userId}`, {
    method: 'DELETE',
  })
}

export function createOpenInvite(
  getToken: () => Promise<string>,
  listId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/invites`, { method: 'POST' })
}

export async function getInvitePreview(inviteId: string): Promise<{
  id: string
  list_name: string
  list_emoji: string | null
  invited_by_name: string | null
}> {
  const res = await fetch(`${BACKEND_URL}/invites/${inviteId}`)
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
  return apiFetch(getToken, `/invites/${inviteId}/accept`, {
    method: 'POST',
  }) as Promise<{ list_id: string }>
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
  payload: {
    amount: number
    price_per: 'KILOGRAM' | null
    store: string | null
  },
): Promise<PriceEntry> {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}/prices`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<PriceEntry>
}

export function updatePrice(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  payload: {
    amount: number
    price_per: 'KILOGRAM' | null
    store: string | null
  },
): Promise<PriceEntry> {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}/prices`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }) as Promise<PriceEntry>
}

export function deletePrice(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}/prices`, {
    method: 'DELETE',
  })
}

export function submitParsedReceipt(
  getToken: () => Promise<string>,
  listId: string,
  body: ReceiptScanRequest,
): Promise<ReceiptScanResult> {
  return apiFetch(getToken, `/lists/${listId}/receipt`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<ReceiptScanResult>
}

export function submitReceiptPrices(
  getToken: () => Promise<string>,
  listId: string,
  batch: ReceiptPriceBatch,
): Promise<{ items_updated: number }> {
  return apiFetch(getToken, `/lists/${listId}/receipt-prices`, {
    method: 'POST',
    body: JSON.stringify(batch),
  }) as Promise<{ items_updated: number }>
}

export interface FeedbackPayload {
  message: string
  email?: string | null
  source?: 'manual'
}

export interface FeedbackResponse {
  id: string
  created_at: string
}

export function submitFeedback(
  getToken: () => Promise<string>,
  payload: FeedbackPayload,
): Promise<FeedbackResponse> {
  return apiFetch(getToken, '/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<FeedbackResponse>
}

export function submitWaitlistSignup(email: string, inviteToken?: string) {
  return fetch(`${BACKEND_URL}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      ...(inviteToken ? { invite_token: inviteToken } : {}),
    }),
  }).then(async (res) => {
    if (!res.ok) throw new ApiError(res.status, await res.text())
    return res.json()
  })
}
