import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.resetModules()
    mockGenerateContent.mockReset()
    mockGenerateContent.mockResolvedValue(successResponse)

    // Ensure tests don't timeout waiting for 10s resize timeout
    // jsdom doesn't load blob URLs, so mock Image to fire onerror instantly
    vi.stubGlobal(
      'Image',
      class {
        width = 0
        height = 0
        onload: ((ev: Event) => void) | null = null
        onerror: ((ev: Event) => void) | null = null
        set src(_val: string) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'))
          }, 0)
        }
      },
    )

    if (typeof URL !== 'undefined') {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    }
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

  it('does not retry on 400 errors', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    const err = new Error('400 Bad Request')
    Object.assign(err, { customErrorData: { status: 400 } })
    mockGenerateContent.mockRejectedValueOnce(err)

    await expect(
      parseReceiptWithAi(file, { maxRetries: 2, delayMs: 0 }),
    ).rejects.toThrow('400 Bad Request')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 errors', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    const err = new Error('429 Too Many Requests')
    Object.assign(err, {
      code: 'AI/fetch-error',
      customErrorData: { status: 429 },
    })
    mockGenerateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(successResponse)

    const result = await parseReceiptWithAi(file, { delayMs: 0 })
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(result.store).toBe('Mercadona')
  })

  it('does not retry on 403 errors with blocked message (no status field fallback)', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    // No customErrorData.status, just the message
    const err = new Error(
      'AI: Error fetching from ...: [403 Forbidden] ... blocked ...',
    )
    mockGenerateContent.mockRejectedValueOnce(err)

    await expect(
      parseReceiptWithAi(file, { maxRetries: 2, delayMs: 0 }),
    ).rejects.toThrow('blocked')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('does not retry on 403 errors with blocked message (with customErrorData.status)', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    const err = new Error(
      'AI: Error fetching from ...: [403 Forbidden] ... blocked ...',
    )
    Object.assign(err, {
      code: 'AI/fetch-error',
      customErrorData: { status: 403 },
    })
    mockGenerateContent.mockRejectedValueOnce(err)

    await expect(
      parseReceiptWithAi(file, { maxRetries: 2, delayMs: 0 }),
    ).rejects.toThrow('blocked')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('retries on Safari Load failed errors', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

    const err = new Error('Load failed')
    mockGenerateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(successResponse)

    const result = await parseReceiptWithAi(file, { delayMs: 0 })
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(result.store).toBe('Mercadona')
  })

  describe('image resizing', () => {
    beforeEach(() => {
      const mockGetContext = vi.fn(() => ({
        drawImage: vi.fn(),
      }))

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        mockGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext,
      )
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
        () => 'data:image/jpeg;base64,mock',
      )
    })

    it('resizes an image exceeding maxDimension', async () => {
      vi.stubGlobal(
        'Image',
        class {
          width = 2000
          height = 1000
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            setTimeout(() => {
              if (this.onload) {
                this.onload(new Event('load'))
              }
            }, 10)
          }
        },
      )

      const createElementSpy = vi.spyOn(document, 'createElement')

      const { parseReceiptWithAi } = await import('./receiptAi')
      const file = new File(
        [new Uint8Array(10 * 1024).fill(65)],
        'receipt.jpg',
        { type: 'image/jpeg' },
      )

      await parseReceiptWithAi(file)
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: { mimeType: 'image/jpeg', data: 'mock' },
          }),
        ]),
      )
      expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith(
        'image/jpeg',
        0.85,
      )

      const canvases = createElementSpy.mock.results
        .map((r) => r.value)
        .filter((v) => v instanceof HTMLCanvasElement)
      expect(canvases.length).toBeGreaterThan(0)
      expect(canvases[0].width).toBe(1600)
      expect(canvases[0].height).toBe(800)
    })

    it('does not upscale an image under maxDimension even if it is > 1MB', async () => {
      vi.stubGlobal(
        'Image',
        class {
          width = 1200
          height = 900
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            setTimeout(() => {
              if (this.onload) this.onload(new Event('load'))
            }, 10)
          }
        },
      )

      const createElementSpy = vi.spyOn(document, 'createElement')
      const { parseReceiptWithAi } = await import('./receiptAi')
      // Create a 2MB file
      const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'receipt.jpg', {
        type: 'image/jpeg',
      })

      await parseReceiptWithAi(file)

      const canvases = createElementSpy.mock.results
        .map((r) => r.value)
        .filter((v) => v instanceof HTMLCanvasElement)
      // Since it's > 1MB, it gets compressed (toDataURL is called), but NOT upscaled
      expect(canvases.length).toBeGreaterThan(0)
      expect(canvases[0].width).toBe(1200)
      expect(canvases[0].height).toBe(900)
    })

    it('falls back to original mime type on onerror', async () => {
      vi.stubGlobal(
        'Image',
        class {
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            setTimeout(() => {
              if (this.onerror) this.onerror(new Event('error'))
            }, 10)
          }
        },
      )

      const { parseReceiptWithAi } = await import('./receiptAi')
      const file = new File(['x'], 'receipt.png', { type: 'image/png' })

      await parseReceiptWithAi(file)
      // Since it errored, it reads as base64 but keeps image/png
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/png' }),
          }),
        ]),
      )
    })

    it('falls back to original file if image has 0x0 dimensions (SVG)', async () => {
      vi.stubGlobal(
        'Image',
        class {
          width = 0
          height = 0
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            setTimeout(() => {
              if (this.onload) this.onload(new Event('load'))
            }, 10)
          }
        },
      )

      const { parseReceiptWithAi } = await import('./receiptAi')
      // File over 1MB
      const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'receipt.svg', {
        type: 'image/svg+xml',
      })

      await parseReceiptWithAi(file)
      // Since it bailed, it falls back to the original file
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/svg+xml' }),
          }),
        ]),
      )
    })

    it('falls back to original file if resized base64 is larger than original file (inflation)', async () => {
      vi.stubGlobal(
        'Image',
        class {
          width = 1200
          height = 900
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            setTimeout(() => {
              if (this.onload) this.onload(new Event('load'))
            }, 10)
          }
        },
      )

      // Override toDataURL to return a huge string that is larger than the file * 4/3
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
        () => {
          return 'data:image/jpeg;base64,' + 'A'.repeat(2 * 1024 * 1024)
        },
      )

      const { parseReceiptWithAi } = await import('./receiptAi')
      // File is 1.1MB
      const file = new File(
        [new ArrayBuffer(1.1 * 1024 * 1024)],
        'receipt.jpg',
        { type: 'image/jpeg' },
      )

      await parseReceiptWithAi(file)

      // Since the resized string is 2MB which is > 1.1MB * 4/3 (~1.46MB), it should fall back
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/jpeg' }),
          }),
        ]),
      )
    })

    it('times out image resizing after 10s and falls back', async () => {
      vi.useFakeTimers()
      vi.stubGlobal(
        'Image',
        class {
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            // never fires
          }
        },
      )

      const { parseReceiptWithAi } = await import('./receiptAi')
      const file = new File(['x'], 'receipt.png', { type: 'image/png' })

      const promise = parseReceiptWithAi(file)
      vi.advanceTimersByTime(10000)
      await promise

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/png' }),
          }),
        ]),
      )
    })
  })
})
