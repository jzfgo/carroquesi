import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard, copyWhenReady } from './clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard',
)

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

// jsdom doesn't implement document.execCommand, so we assign a mock directly.
function setExecCommand(result: boolean) {
  const fn = vi.fn().mockReturnValue(result)
  ;(document as unknown as { execCommand: unknown }).execCommand = fn
  return fn
}

afterEach(() => {
  if (originalClipboard)
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else setClipboard(undefined)
  delete (document as unknown as { execCommand?: unknown }).execCommand
  vi.restoreAllMocks()
})

describe('copyToClipboard', () => {
  it('uses navigator.clipboard.writeText in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })

    expect(await copyToClipboard('cqs_key')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('cqs_key')
  })

  it('falls back to execCommand when navigator.clipboard is unavailable (insecure origin)', async () => {
    setClipboard(undefined)
    const execCommand = setExecCommand(true)

    expect(await copyToClipboard('cqs_key')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    // the temporary textarea must be cleaned up
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back to execCommand when writeText rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    const execCommand = setExecCommand(true)

    expect(await copyToClipboard('cqs_key')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('returns false when both paths fail', async () => {
    setClipboard(undefined)
    setExecCommand(false)

    expect(await copyToClipboard('cqs_key')).toBe(false)
  })
})

describe('copyWhenReady', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * The point of the whole function: WebKit revokes the user's gesture across
   * an await, and both paths in `copyToClipboard` need that gesture. So the
   * clipboard call has to be made while the text is still a promise.
   */
  it('calls write before the text resolves', async () => {
    let give: (t: string) => void = () => {}
    const text = new Promise<string>((resolve) => {
      give = resolve
    })
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('ClipboardItem', class ClipboardItemStub {})
    setClipboard({ write })

    const copying = copyWhenReady(text)
    await Promise.resolve()
    expect(write).toHaveBeenCalledOnce()

    give('cqs_key')
    expect(await copying).toBe(true)
  })

  it('falls back to the ordinary path where ClipboardItem is absent', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })

    expect(await copyWhenReady(Promise.resolve('cqs_key'))).toBe(true)
    expect(writeText).toHaveBeenCalledWith('cqs_key')
  })

  // An engine can ship the constructor without accepting a promise for the
  // value, which throws where a missing constructor would not.
  it('falls back when the constructor refuses a promise', async () => {
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemStub {
        constructor() {
          throw new TypeError('not a Blob')
        }
      },
    )
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText, write: vi.fn() })

    expect(await copyWhenReady(Promise.resolve('cqs_key'))).toBe(true)
    expect(writeText).toHaveBeenCalledWith('cqs_key')
  })

  it('reports failure when the text never arrives', async () => {
    vi.stubGlobal('ClipboardItem', class ClipboardItemStub {})
    setClipboard({ write: vi.fn().mockRejectedValue(new Error('rejected')) })

    expect(await copyWhenReady(Promise.reject(new Error('offline')))).toBe(
      false,
    )
  })
})
