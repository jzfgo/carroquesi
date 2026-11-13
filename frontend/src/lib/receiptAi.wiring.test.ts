import {
  AIError,
  AIErrorCode,
  FinishReason,
  InferenceMode,
  InferenceSource,
} from 'firebase/ai'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Kept in its own file so stubbing generateContent — a whole fake model
// response — never constrains the pure toReceiptInstant tests next door.
// The accessor is stubbed because the real one would build the real Firebase
// app, which needs credentials the test runner does not have.
vi.mock('./firebase', () => ({
  getFirebaseAi: vi.fn(() => ({})),
}))

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn<(...args: unknown[]) => unknown>(() => ({
  generateContent: (...args: unknown[]) => mockGenerateContent(...args),
}))

// Only getGenerativeModel is replaced. AIError, AIErrorCode and FinishReason
// come from the real SDK, because the retry rules read them: a hand-written
// stand-in would let a fixture assert a shape Google never produces.
vi.mock('firebase/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/ai')>()),
  getGenerativeModel: (ai: unknown, params: unknown) =>
    mockGetGenerativeModel(ai, params),
}))

/** What the SDK throws for an HTTP error response from the proxy. */
const fetchError = (status: number) =>
  new AIError(
    AIErrorCode.FETCH_ERROR,
    `Error fetching from https://firebasevertexai.googleapis.com: [${status} Error] details`,
    { status, statusText: 'Error' },
  )

/** What the SDK throws when a candidate comes back with a bad finish reason. */
const responseError = (finishReason: FinishReason) =>
  new AIError(
    AIErrorCode.RESPONSE_ERROR,
    `Text not available. Candidate was blocked due to ${finishReason}`,
    {
      response: {
        candidates: [
          { index: 0, content: { role: 'model', parts: [] }, finishReason },
        ],
      },
    },
  )

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

  const receiptFile = () =>
    new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.resetModules()
    mockGenerateContent.mockReset()
    mockGenerateContent.mockResolvedValue(successResponse)

    // jsdom never loads a blob URL, so an unstubbed Image would sit until the
    // resize timeout. Fire onerror instead: these tests are about the retry
    // rules, and the resize ones below stub their own Image.
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

    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('converts receipt_date/receipt_time to a UTC instant, not the raw date', async () => {
    const { parseReceiptWithAi } = await import('./receiptAi')

    const result = await parseReceiptWithAi(receiptFile())

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

    const result = await parseReceiptWithAi(receiptFile())

    expect(result.store).toBe('Mercadona')
    expect(result.receipt_total).toBe(1.15)
    expect(result.lines).toEqual([])
  })

  describe('inference source', () => {
    let infoSpy: MockInstance<typeof console.info>

    beforeEach(() => {
      infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    })

    it('logs which model answered and returns it on the request', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent.mockResolvedValue({
        response: {
          ...successResponse.response,
          inferenceSource: InferenceSource.ON_DEVICE,
        },
      })

      const result = await parseReceiptWithAi(receiptFile())

      expect(result.inference_source).toBe(InferenceSource.ON_DEVICE)
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining(InferenceSource.ON_DEVICE),
      )
    })

    it('logs "unknown" and returns null when the SDK reports no source', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')

      const result = await parseReceiptWithAi(receiptFile())

      expect(result.inference_source).toBeNull()
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('unknown'))
    })

    it('attributes a garbled response, not just the retry that follows it', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      // The suspected failure shape: the on-device model garbles its output,
      // the retry lands in the cloud and succeeds. If only the success were
      // logged, the fallback would stay invisible — the whole point is lost.
      mockGenerateContent
        .mockResolvedValueOnce({
          response: {
            text: () => '{"store":"Mercadona","lines":[{"na',
            inferenceSource: InferenceSource.ON_DEVICE,
          },
        })
        .mockResolvedValueOnce({
          response: {
            ...successResponse.response,
            inferenceSource: InferenceSource.IN_CLOUD,
          },
        })

      const result = await parseReceiptWithAi(receiptFile(), { delayMs: 0 })

      expect(infoSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(InferenceSource.ON_DEVICE),
      )
      expect(infoSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(InferenceSource.IN_CLOUD),
      )
      // The request carries the source of the generation whose parse
      // succeeded — that is the one whose lines the scan row records.
      expect(result.inference_source).toBe(InferenceSource.IN_CLOUD)
    })
  })

  describe('retrying', () => {
    it('retries a 500 and succeeds on the next attempt', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent
        .mockRejectedValueOnce(fetchError(500))
        .mockResolvedValueOnce(successResponse)

      const result = await parseReceiptWithAi(receiptFile(), { delayMs: 0 })

      expect(mockGenerateContent).toHaveBeenCalledTimes(2)
      expect(result.store).toBe('Mercadona')
    })

    it('retries a 429', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent
        .mockRejectedValueOnce(fetchError(429))
        .mockResolvedValueOnce(successResponse)

      await parseReceiptWithAi(receiptFile(), { delayMs: 0 })

      expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    })

    it('gives up after three attempts on a persistent 500', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent.mockRejectedValue(fetchError(503))

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow(/503/)
      expect(mockGenerateContent).toHaveBeenCalledTimes(3)
    })

    it('does not retry a 400', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent.mockRejectedValue(fetchError(400))

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow(/400/)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    })

    it('does not retry a 403', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent.mockRejectedValue(fetchError(403))

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow(/403/)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    })

    it('does not retry a 403 that says "blocked", as App Check rejections do', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      // The word in the message used to be what decided this, so a rejection
      // reading like a content block was retried three times.
      mockGenerateContent.mockRejectedValue(
        new AIError(
          AIErrorCode.FETCH_ERROR,
          'Error fetching from url: [403 Forbidden] requests are blocked',
          { status: 403, statusText: 'Forbidden' },
        ),
      )

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow(/blocked/)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    })

    it('retries a network-level failure, which carries no HTTP status', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      // Safari on a dropped connection, as the SDK re-wraps it.
      mockGenerateContent
        .mockRejectedValueOnce(
          new AIError(
            AIErrorCode.ERROR,
            'Error fetching from url: Load failed',
          ),
        )
        .mockResolvedValueOnce(successResponse)

      await parseReceiptWithAi(receiptFile(), { delayMs: 0 })

      expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    })

    it('does not retry a safety block — asking again cannot change the verdict', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent.mockRejectedValue(
        responseError(FinishReason.PROHIBITED_CONTENT),
      )

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow(/PROHIBITED_CONTENT/)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    })

    it('does not retry a prompt-level block, which carries no candidate', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      // The other shape of RESPONSE_ERROR. The prompt itself was refused, so
      // there is no candidate to read a finish reason from.
      mockGenerateContent.mockRejectedValue(
        new AIError(
          AIErrorCode.RESPONSE_ERROR,
          'Text not available. Response was blocked due to SAFETY',
          {
            response: {
              promptFeedback: { blockReason: 'SAFETY', safetyRatings: [] },
            },
          },
        ),
      )

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow(/SAFETY/)
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    })

    it('retries a malformed response, which is the model garbling its own output', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      mockGenerateContent
        .mockRejectedValueOnce(responseError(FinishReason.MALFORMED_RESPONSE))
        .mockResolvedValueOnce(successResponse)

      await parseReceiptWithAi(receiptFile(), { delayMs: 0 })

      expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    })

    it('retries truncated JSON, which a shorter generation can get past', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      // A response cut off at the token limit: valid so far, not valid JSON.
      mockGenerateContent
        .mockResolvedValueOnce({
          response: {
            text: () => '{"store":"Mercadona","lines":[{"name":"Lech',
          },
        })
        .mockResolvedValueOnce(successResponse)

      await parseReceiptWithAi(receiptFile(), { delayMs: 0 })

      expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    })

    it('does not retry the SDK fetch timeout', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      // The SDK aborts its own request after 180s and throws this unwrapped.
      // Three of those would hold the user behind the modal for nine minutes.
      mockGenerateContent.mockRejectedValue(
        new DOMException('Timeout has expired.', 'AbortError'),
      )

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow('Timeout has expired.')
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    })

    it('does not retry an error it cannot classify', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')
      // Mentions 500, but as a quota figure. Nothing typed says to retry.
      mockGenerateContent.mockRejectedValue(
        new Error('Quota exceeded: limit is 500 requests per day'),
      )

      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow('Quota exceeded')
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    })

    it('does not retry an unrecognised AIErrorCode or missing error metadata', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')

      mockGenerateContent.mockRejectedValueOnce(
        new AIError(AIErrorCode.NO_API_KEY, 'Missing API key'),
      )
      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow('Missing API key')

      mockGenerateContent.mockRejectedValueOnce(
        new AIError(AIErrorCode.FETCH_ERROR, 'Network failure'),
      )
      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow('Network failure')

      mockGenerateContent.mockRejectedValueOnce(
        new AIError(AIErrorCode.RESPONSE_ERROR, 'Blocked without candidates'),
      )
      await expect(
        parseReceiptWithAi(receiptFile(), { delayMs: 0 }),
      ).rejects.toThrow('Blocked without candidates')

      expect(mockGenerateContent).toHaveBeenCalledTimes(3)
    })

    it('configures the model schema, prompt, and exponential backoff', async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const { parseReceiptWithAi } = await import('./receiptAi')

      mockGenerateContent
        .mockRejectedValueOnce(fetchError(503))
        .mockRejectedValueOnce(fetchError(503))
        .mockResolvedValueOnce(successResponse)

      await parseReceiptWithAi(receiptFile(), { delayMs: 5 })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10)

      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1)
      const modelParams = mockGetGenerativeModel.mock.calls[0]?.[1] as {
        mode: InferenceMode
        onDeviceParams: {
          createOptions: {
            expectedInputs: Array<{ type: string }>
            expectedOutputs: Array<{ type: string; languages: string[] }>
          }
          promptOptions: { responseConstraint: { required: string[] } }
        }
        inCloudParams: {
          model: string
          generationConfig: {
            responseMimeType: string
            responseJsonSchema: {
              required: string[]
              properties: {
                lines: { items: { required: string[] } }
              }
            }
          }
        }
      }
      expect(modelParams.mode).toBe(InferenceMode.PREFER_IN_CLOUD)
      expect(modelParams.onDeviceParams.createOptions).toEqual({
        expectedInputs: [{ type: 'image' }],
        expectedOutputs: [{ type: 'text', languages: ['es'] }],
      })
      expect(
        modelParams.onDeviceParams.promptOptions.responseConstraint.required,
      ).toEqual(['lines'])
      expect(modelParams.inCloudParams.model).toBe('gemini-3.8-flash')
      expect(modelParams.inCloudParams.generationConfig.responseMimeType).toBe(
        'application/json',
      )
      expect(
        modelParams.inCloudParams.generationConfig.responseJsonSchema.required,
      ).toEqual(['lines'])
      expect(
        modelParams.inCloudParams.generationConfig.responseJsonSchema.properties
          .lines.items.required,
      ).toEqual(['name', 'price_type', 'unit_price', 'line_total'])

      expect(mockGenerateContent).toHaveBeenCalledWith([
        expect.objectContaining({ type: 'inlineData' }),
        expect.stringContaining(
          'Extract structured data from this Spanish grocery receipt',
        ),
      ])
    })
  })

  describe('image resizing', () => {
    const stubImage = (width: number, height: number) =>
      vi.stubGlobal(
        'Image',
        class {
          width = width
          height = height
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            setTimeout(() => this.onload?.(new Event('load')), 10)
          }
        },
      )

    const createdCanvases = () =>
      createElementSpy.mock.results
        .map((r) => r.value)
        .filter((v): v is HTMLCanvasElement => v instanceof HTMLCanvasElement)

    let createElementSpy: MockInstance<typeof document.createElement>

    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        (() => ({ drawImage: vi.fn() })) as never,
      )
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
        () => 'data:image/jpeg;base64,mock',
      )
      createElementSpy = vi.spyOn(document, 'createElement')
    })

    it('scales a portrait receipt to 1000px wide, keeping its aspect ratio', async () => {
      // The exact photo from the JAV-51 report.
      stubImage(1418, 3543)
      const drawImage = vi.fn()
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        (() => ({ drawImage })) as never,
      )
      const { parseReceiptWithAi } = await import('./receiptAi')
      const file = new File([new ArrayBuffer(490 * 1024)], 'receipt.jpg', {
        type: 'image/jpeg',
      })

      await parseReceiptWithAi(file)

      const [canvas] = createdCanvases()
      expect(canvas.width).toBe(1000)
      expect(canvas.height).toBe(2499)
      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d')
      expect(drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        1000,
        2499,
      )
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'inlineData',
            inlineData: { mimeType: 'image/jpeg', data: 'mock' },
          }),
        ]),
      )
      expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith(
        'image/jpeg',
        0.85,
      )
    })

    it('keeps the resized encode when base64 length equals 4/3 of file size', async () => {
      stubImage(2000, 3000)
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
        () => 'data:image/jpeg;base64,' + 'R'.repeat(16),
      )
      const { parseReceiptWithAi } = await import('./receiptAi')
      // 12 bytes * 4 / 3 = 16 base64 chars — boundary for <= vs <.
      const file = new File([new ArrayBuffer(12)], 'receipt.jpg', {
        type: 'image/jpeg',
      })

      await parseReceiptWithAi(file)

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'inlineData',
            inlineData: { mimeType: 'image/jpeg', data: 'R'.repeat(16) },
          }),
        ]),
      )
    })

    it('sends an already-narrow image untouched, however heavy the file', async () => {
      stubImage(900, 2000)
      const { parseReceiptWithAi } = await import('./receiptAi')
      // 2 MB, so file size alone must not trigger a re-encode: shrinking it
      // would cost legibility without reducing what the model reads.
      const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'receipt.png', {
        type: 'image/png',
      })

      await parseReceiptWithAi(file)

      expect(createdCanvases()).toHaveLength(0)
      expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled()
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/png' }),
          }),
        ]),
      )
    })

    it('falls back to the original file when the image will not decode', async () => {
      vi.stubGlobal(
        'Image',
        class {
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            setTimeout(() => this.onerror?.(new Event('error')), 10)
          }
        },
      )
      const { parseReceiptWithAi } = await import('./receiptAi')

      await parseReceiptWithAi(
        new File(['x'], 'receipt.png', { type: 'image/png' }),
      )

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/png' }),
          }),
        ]),
      )
    })

    it('falls back when the image reports no intrinsic size, as an SVG does', async () => {
      stubImage(0, 0)
      const { parseReceiptWithAi } = await import('./receiptAi')

      await parseReceiptWithAi(
        new File([new ArrayBuffer(2 * 1024 * 1024)], 'receipt.svg', {
          type: 'image/svg+xml',
        }),
      )

      expect(createdCanvases()).toHaveLength(0)
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/svg+xml' }),
          }),
        ]),
      )
    })

    it('falls back when the re-encode comes out larger than the original', async () => {
      stubImage(2000, 3000)
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
        () => 'data:image/jpeg;base64,' + 'B'.repeat(2 * 1024 * 1024),
      )
      const { parseReceiptWithAi } = await import('./receiptAi')
      // 1.1 MB in, so the 2 MB re-encode exceeds it even allowing for base64.
      const file = new File(
        [new ArrayBuffer(1.1 * 1024 * 1024)],
        'receipt.jpg',
        { type: 'image/jpeg' },
      )

      await parseReceiptWithAi(file)

      expect(createdCanvases()).toHaveLength(1)
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({
              mimeType: 'image/jpeg',
              data: expect.not.stringMatching(/^B/),
            }),
          }),
        ]),
      )
    })

    it('gives up on resizing after 10s and sends the original', async () => {
      vi.useFakeTimers()
      vi.stubGlobal(
        'Image',
        class {
          onload: ((ev: Event) => void) | null = null
          onerror: ((ev: Event) => void) | null = null
          set src(_val: string) {
            // Neither handler ever fires.
          }
        },
      )
      const { parseReceiptWithAi } = await import('./receiptAi')

      const promise = parseReceiptWithAi(
        new File(['x'], 'receipt.png', { type: 'image/png' }),
      )
      await vi.advanceTimersByTimeAsync(10_000)
      await promise

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/png' }),
          }),
        ]),
      )
    })

    it('falls back when only width is zero, when width is exactly 1000px, or when 2d context is null', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')

      stubImage(0, 100)
      await parseReceiptWithAi(
        new File(['x'], 'zero-w.png', { type: 'image/png' }),
      )
      expect(createdCanvases()).toHaveLength(0)

      stubImage(1000, 2000)
      await parseReceiptWithAi(
        new File(['x'], 'exact.png', { type: 'image/png' }),
      )
      expect(createdCanvases()).toHaveLength(0)

      stubImage(2000, 3000)
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        (() => null) as never,
      )
      await parseReceiptWithAi(
        new File(['x'], 'no-ctx.png', { type: 'image/png' }),
      )
      expect(createdCanvases()).toHaveLength(1)
      expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled()
    })

    it('skips resizing for non-image files like PDFs and strips the data URL prefix', async () => {
      const { parseReceiptWithAi } = await import('./receiptAi')

      await parseReceiptWithAi(
        new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }),
      )

      expect(URL.createObjectURL).not.toHaveBeenCalled()
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'inlineData',
            inlineData: {
              mimeType: 'application/pdf',
              data: btoa('%PDF-1.4'),
            },
          }),
        ]),
      )
    })
  })
})
