import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptInvite,
  ApiError,
  createItem,
  createList,
  deleteList,
  getInvitePreview,
  getLists,
  getListUpdatedAt,
  submitFeedback,
  submitWaitlistSignup,
  updateItem,
  updateList,
} from './api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockGetToken = vi.fn().mockResolvedValue('test-token')

function mockResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(body)),
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  mockGetToken.mockReset()
  mockGetToken.mockResolvedValue('test-token')
})

describe('apiFetch — authorization', () => {
  it('calls getToken on every request and sends the token as Bearer', async () => {
    mockFetch.mockReturnValue(mockResponse([]))
    await getLists(mockGetToken)
    expect(mockGetToken).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })
})

describe('ApiError', () => {
  it('carries .status on non-2xx response', async () => {
    mockFetch.mockReturnValue(mockResponse('Not found', 404))
    await expect(getLists(mockGetToken)).rejects.toMatchObject({ status: 404 })
  })

  it('is an instance of ApiError', async () => {
    mockFetch.mockReturnValue(mockResponse('Server error', 500))
    try {
      await getLists(mockGetToken)
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
    }
  })
})

describe('getLists', () => {
  it('GET /lists returns parsed JSON', async () => {
    mockFetch.mockReturnValue(mockResponse([{ id: 'l1', name: 'Compras' }]))
    const result = await getLists(mockGetToken)
    expect(result).toEqual([{ id: 'l1', name: 'Compras' }])
  })
})

describe('createList', () => {
  it('POST /lists with name and emoji body', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'l1', name: 'Compras' }))
    await createList(mockGetToken, { name: 'Compras', emoji: '🛒' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Compras', emoji: '🛒' }),
      }),
    )
  })
})

describe('createItem', () => {
  it('POST /lists/{id}/items', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'item-1', name: 'Leche' }))
    await createItem(mockGetToken, 'list-1', { name: 'Leche' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/list-1/items'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('updateItem', () => {
  it('PATCH /lists/{id}/items/{itemId}', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'item-1', purchased: true }))
    await updateItem(mockGetToken, 'list-1', 'item-1', { purchased: true })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/list-1/items/item-1'),
      expect.objectContaining({ method: 'PATCH' }),
    )
  })
})

describe('getListUpdatedAt', () => {
  it('GET /lists/{id}/updated-at', async () => {
    mockFetch.mockReturnValue(
      mockResponse({ updated_at: '2026-01-01T00:00:00' }),
    )
    const result = (await getListUpdatedAt(mockGetToken, 'list-1')) as {
      updated_at: string
    }
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/list-1/updated-at'),
      expect.any(Object),
    )
    expect(result.updated_at).toBe('2026-01-01T00:00:00')
  })
})

describe('updateList', () => {
  it('PATCH /lists/{id} with patch body', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'l1', name: 'Nuevo nombre' }))
    await updateList(mockGetToken, 'l1', { name: 'Nuevo nombre' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/l1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Nuevo nombre' }),
      }),
    )
  })
})

describe('deleteList', () => {
  it('DELETE /lists/{id} returns null on 204', async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 204,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
      }),
    )
    const result = await deleteList(mockGetToken, 'l1')
    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/l1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('getInvitePreview', () => {
  it('GET /invites/:id — fetches without auth header', async () => {
    mockFetch.mockReturnValue(
      mockResponse({
        id: 'inv1',
        list_name: 'Compras',
        invited_by_name: 'Ana',
      }),
    )
    const result = await getInvitePreview('inv1')
    expect(result).toEqual({
      id: 'inv1',
      list_name: 'Compras',
      invited_by_name: 'Ana',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/invites/inv1'),
    )
    expect(mockFetch.mock.calls[0][1]).toBeUndefined()
  })

  it('throws ApiError on non-2xx', async () => {
    mockFetch.mockReturnValue(mockResponse('Not found', 404))
    await expect(getInvitePreview('bad-id')).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('acceptInvite', () => {
  it('POST /invites/:id/accept — sends auth header and returns list_id', async () => {
    mockFetch.mockReturnValue(mockResponse({ list_id: 'l1' }))
    const result = await acceptInvite(mockGetToken, 'inv1')
    expect(result).toEqual({ list_id: 'l1' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/invites/inv1/accept'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })
})

describe('submitFeedback', () => {
  it('submitFeedback posts feedback payload', async () => {
    mockFetch.mockReturnValue(
      mockResponse({ id: 'fb-1', created_at: '2026-05-31T10:00:00' }),
    )

    const result = await submitFeedback(mockGetToken, {
      message: 'Great app',
      email: 'alice@example.com',
      source: 'manual',
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          message: 'Great app',
          email: 'alice@example.com',
          source: 'manual',
        }),
      }),
    )
    expect(result).toEqual({ id: 'fb-1', created_at: '2026-05-31T10:00:00' })
  })
})

describe('submitWaitlistSignup', () => {
  it('submits email and returns response on success', async () => {
    mockFetch.mockReturnValue(mockResponse({ status: 'ok' }))
    const result = await submitWaitlistSignup('test@example.com')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/waitlist',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }),
      }),
    )
    expect(result).toEqual({ status: 'ok' })
  })

  it('throws ApiError on non-2xx response', async () => {
    mockFetch.mockReturnValue(mockResponse('Error message', 400))
    await expect(submitWaitlistSignup('bad-email')).rejects.toThrow(ApiError)
  })
})
