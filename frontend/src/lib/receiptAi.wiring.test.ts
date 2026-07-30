import { beforeEach, describe, expect, it, vi } from 'vitest'

// Kept in its own file so stubbing generateContent — a whole fake model
// response — never constrains the pure toReceiptInstant tests next door. Both
// files stub ./firebase; only this one needs to fake the SDK's behaviour.
vi.mock('./firebase', () => ({
  auth: { currentUser: null },
  ai: {},
}))

const mockGenerateContent = vi.fn()

vi.mock('firebase/ai', () => ({
  InferenceMode: { PREFER_IN_CLOUD: 'prefer_in_cloud' },
  getGenerativeModel: () => ({
    generateContent: (...args: unknown[]) => mockGenerateContent(...args),
  }),
}))

describe('parseReceiptWithAi wiring', () => {
  const successResponse = {
    response: {
      text: () =>
        JSON.stringify({
          store: 'Mercadona',
          receipt_date: '2026-07-12',
          receipt_time: '17:42',
          receipt_total: 1.15,
          lines: [],
        }),
    },
  }

  beforeEach(() => {
    vi.resetModules()
    mockGenerateContent.mockReset()
    mockGenerateContent.mockResolvedValue(successResponse)
  })

  it('converts receipt_date/receipt_time to a UTC instant, not the raw date', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    const result = await parseReceiptWithAi(file)

    expect(result.receipt_date).not.toBe('2026-07-12')
    expect(result.receipt_date).toMatch(/Z$/)

    const parsed = new Date(result.receipt_date as string)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(6)
    expect(parsed.getDate()).toBe(12)
    expect(parsed.getHours()).toBe(17)
    expect(parsed.getMinutes()).toBe(42)
  })

  it('passes store, receipt_total and lines through unchanged', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    const result = await parseReceiptWithAi(file)

    expect(result.store).toBe('Mercadona')
    expect(result.receipt_total).toBe(1.15)
    expect(result.lines).toEqual([])
  })

  it('retries on transient errors and succeeds when a subsequent attempt succeeds', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    // Simulate transient 500 error on first attempt, then success on second
    mockGenerateContent
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValueOnce(successResponse)

    const result = await parseReceiptWithAi(file, { delayMs: 0 })

    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(result.store).toBe('Mercadona')
  })

  it('fails after exhausting maxRetries on persistent errors', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    mockGenerateContent.mockRejectedValue(
      new Error('500 Internal Server Error'),
    )

    await expect(
      parseReceiptWithAi(file, { maxRetries: 2, delayMs: 0 }),
    ).rejects.toThrow('500 Internal Server Error')
    expect(mockGenerateContent).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })
})
