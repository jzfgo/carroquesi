import { createReceiptUploadUrl } from './api'
import { getPdfjs } from './pdfjs'

// Mirrors the backend's allow-list; anything else would answer 415.
const UPLOADABLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

// The signed URL binds this exact range, so the PUT must repeat it.
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

/**
 * Store the scanned file in the receipt bucket, best-effort. The backend
 * mints a signed URL and the bytes go straight to GCS — the scan itself has
 * already succeeded by the time this runs, so callers fire and forget.
 */
export async function uploadReceiptFile(
  getToken: () => Promise<string>,
  listId: string,
  scanId: string,
  file: File,
): Promise<void> {
  // The capture can arrive in a format the bucket refuses (HEIC on iOS).
  // Skip quietly: the paper copy is a bonus, never a reason to fail a scan.
  if (!UPLOADABLE_TYPES.has(file.type)) return

  const pages =
    file.type === 'application/pdf' ? await countPdfPages(file) : undefined

  const { upload_url } = await createReceiptUploadUrl(
    getToken,
    listId,
    scanId,
    { content_type: file.type, pages },
  )

  const res = await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'x-goog-content-length-range': `0,${MAX_RECEIPT_BYTES}`,
    },
    body: file,
  })
  if (!res.ok) {
    throw new Error(`Receipt upload failed: ${res.status}`)
  }
}

// The count rides on the upload so PDF thumbnails can print it without
// opening the file; the review sheet counts the same way for its own thumb.
// Unknown is fine — omit it rather than guess.
export async function countPdfPages(file: File): Promise<number | undefined> {
  try {
    const pdfjs = await getPdfjs()
    const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
    const pages = (await task.promise).numPages
    void task.destroy()
    return pages > 0 ? pages : undefined
  } catch {
    return undefined
  }
}
