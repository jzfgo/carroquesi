import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createReceiptUploadUrl } from './api'
import { getPdfjs } from './pdfjs'
import { uploadReceiptFile } from './receiptUpload'

vi.mock('./api', () => ({
  createReceiptUploadUrl: vi.fn(async () => ({
    upload_url: 'https://storage.example/signed-put',
    expires_in: 900,
  })),
}))

vi.mock('./pdfjs', () => ({
  getPdfjs: vi.fn(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({ numPages: 3 }),
      destroy: () => undefined,
    }),
  })),
}))

const mockFetch = vi.fn(async () => ({ ok: true, status: 200 }))
vi.stubGlobal('fetch', mockFetch)

const getToken = vi.fn(async () => 'token')

function imageFile() {
  return new File(['jpeg-bytes'], 'ticket.jpg', { type: 'image/jpeg' })
}

function pdfFile() {
  return new File(['pdf-bytes'], 'ticket.pdf', { type: 'application/pdf' })
}

beforeEach(() => {
  mockFetch.mockClear()
})

describe('uploadReceiptFile', () => {
  it('mints an upload URL and PUTs the bytes with the signed headers', async () => {
    const file = imageFile()
    await uploadReceiptFile(getToken, 'list-1', 'scan-1', file)

    expect(createReceiptUploadUrl).toHaveBeenCalledWith(
      getToken,
      'list-1',
      'scan-1',
      { content_type: 'image/jpeg', pages: undefined },
    )
    // The signature binds content type and length range; the PUT must
    // repeat both or GCS refuses it.
    expect(mockFetch).toHaveBeenCalledWith(
      'https://storage.example/signed-put',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
          'x-goog-content-length-range': '0,10485760',
        },
        body: file,
      },
    )
  })

  it('skips content types the bucket refuses without minting', async () => {
    const heic = new File(['heic'], 'ticket.heic', { type: 'image/heic' })
    await uploadReceiptFile(getToken, 'list-1', 'scan-1', heic)

    expect(createReceiptUploadUrl).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('counts PDF pages and sends them with the mint request', async () => {
    await uploadReceiptFile(getToken, 'list-1', 'scan-1', pdfFile())

    expect(createReceiptUploadUrl).toHaveBeenCalledWith(
      getToken,
      'list-1',
      'scan-1',
      { content_type: 'application/pdf', pages: 3 },
    )
  })

  it('omits pages when pdf.js fails, and still uploads', async () => {
    ;(getPdfjs as Mock).mockRejectedValueOnce(new Error('offline'))
    await uploadReceiptFile(getToken, 'list-1', 'scan-1', pdfFile())

    expect(createReceiptUploadUrl).toHaveBeenCalledWith(
      getToken,
      'list-1',
      'scan-1',
      { content_type: 'application/pdf', pages: undefined },
    )
    expect(mockFetch).toHaveBeenCalled()
  })

  it('throws when the PUT is refused so callers can log it', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

    await expect(
      uploadReceiptFile(getToken, 'list-1', 'scan-1', imageFile()),
    ).rejects.toThrow('403')
  })
})
