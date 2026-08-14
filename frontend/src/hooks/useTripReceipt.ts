import { useEffect, useState } from 'react'
import type { ReceiptFileUrlResult, ReceiptScanSummary } from '../types'

/**
 * What the header thumbnail (25b) knows about a trip's stored paper.
 *
 * - `off`: the affordance is hidden (flag or consent missing, or the card
 *   is a proto / search result).
 * - `loading`: a scan reconciled this trip; whether it left a file is still
 *   being answered.
 * - `empty`: no stored file — the dashed hole, tap to scan.
 * - `image` / `pdf`: the paper exists — the solid hole, tap to view.
 */
export type TripReceiptState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'image'; scanId: string; thumbUrl: string | null }
  | { status: 'pdf'; scanId: string; pages: number | null }

const OFF: TripReceiptState = { status: 'off' }
const LOADING: TripReceiptState = { status: 'loading' }
const EMPTY: TripReceiptState = { status: 'empty' }

/**
 * Resolve a closed trip's thumbnail state, lazily per mounted card. A trip
 * without a reconciled scan (`has_receipt` false) can never surface a file,
 * so it settles to `empty` with zero fetches — only `has_receipt` trips ask
 * the server which scans exist and whether the latest left a file. The
 * miniature's signed URL is fetched once here; the viewer mints its own
 * fresh one on open, because this one may have expired by then.
 */
export function useTripReceipt(
  purchaseId: string,
  hasReceipt: boolean,
  enabled: boolean,
  loadReceiptScans?: (purchaseId: string) => Promise<ReceiptScanSummary[]>,
  loadReceiptFileUrl?: (scanId: string) => Promise<ReceiptFileUrlResult>,
): TripReceiptState {
  const [fetched, setFetched] = useState<TripReceiptState | null>(null)

  useEffect(() => {
    if (!enabled || !hasReceipt || !loadReceiptScans) return
    let cancelled = false
    loadReceiptScans(purchaseId)
      .then((scans) => {
        if (cancelled) return
        // Oldest-first from the server; the paper shown is the latest one.
        const scan = [...scans].reverse().find((s) => s.has_file)
        if (!scan) {
          setFetched(EMPTY)
          return
        }
        // Pages are recorded only for PDFs, so a count marks the file as
        // one. A PDF whose count could not be read at upload falls through
        // to the image path; its broken miniature lands on the icon
        // fallback, and the viewer decides by the served content type.
        if (scan.file_pages != null) {
          setFetched({
            status: 'pdf',
            scanId: scan.id,
            pages: scan.file_pages,
          })
          return
        }
        setFetched({ status: 'image', scanId: scan.id, thumbUrl: null })
        loadReceiptFileUrl?.(scan.id)
          .then((r) => {
            if (!cancelled) {
              setFetched({ status: 'image', scanId: scan.id, thumbUrl: r.url })
            }
          })
          .catch(() => {
            /* the icon box stands in when no miniature can be shown */
          })
      })
      .catch(() => {
        // An unanswered lookup reads as no paper; the next mount retries.
        if (!cancelled) setFetched(EMPTY)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, hasReceipt, purchaseId, loadReceiptScans, loadReceiptFileUrl])

  if (!enabled) return OFF
  if (!hasReceipt) return EMPTY
  return fetched ?? LOADING
}
