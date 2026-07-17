import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard } from './clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

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
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
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
