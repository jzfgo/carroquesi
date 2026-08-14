import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getPdfjs } from '../lib/pdfjs'
import './ReceiptFileViewer.css'

type Pdfjs = Awaited<ReturnType<typeof getPdfjs>>
type PdfDocument = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>

interface Props {
  url: string
  contentType: string
  /** Recorded page count; the opened document has the last word. */
  pages: number | null
  onClose: () => void
}

/**
 * The stored paper, fullscreen — reached from a 25b solid thumbnail or the
 * review sheet's miniature. An image fills the screen as-is; a PDF loads
 * pdf.js on demand and lays its pages on a horizontal snap track, so paging
 * is a swipe with a «n / N» counter and no gesture code.
 */
export function ReceiptFileViewer({ url, contentType, pages, onClose }: Props) {
  const pdf = contentType === 'application/pdf'
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState(1)
  const trackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    let task: { destroy: () => unknown } | undefined
    getPdfjs()
      .then((pdfjs) => {
        if (cancelled) return null
        const t = pdfjs.getDocument({ url })
        task = t
        return t.promise
      })
      .then((d) => {
        if (!cancelled && d) setDoc(d)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [pdf, url])

  const numPages = doc?.numPages ?? pages ?? 0

  // Which snap slot the track rests on — that is the counter's «n».
  const handleScroll = () => {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    setCurrent(Math.round(el.scrollLeft / el.clientWidth) + 1)
  }

  return (
    <div
      className="rfv"
      role="dialog"
      aria-label="Ticket"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        className="rfv__close"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <X size={22} strokeWidth={2} aria-hidden />
      </button>

      {!pdf && <img src={url} alt="Ticket" className="rfv__img" />}

      {pdf && failed && (
        <p className="rfv__error">No se pudo cargar el ticket</p>
      )}

      {pdf && doc && (
        <>
          <div className="rfv__track" ref={trackRef} onScroll={handleScroll}>
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={doc}
                pageNo={i + 1}
                // Only the resting page and its neighbours hold a rendered
                // canvas — a long PDF must not rasterise whole on open.
                active={Math.abs(i + 1 - current) <= 1}
              />
            ))}
          </div>
          {numPages > 1 && (
            <span className="rfv__count">
              {current} / {numPages}
            </span>
          )}
        </>
      )}
    </div>
  )
}

function PdfPage({
  doc,
  pageNo,
  active,
}: {
  doc: PdfDocument
  pageNo: number
  active: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendered = useRef(false)

  useEffect(() => {
    if (!active || rendered.current) return
    let cancelled = false
    void doc
      .getPage(pageNo)
      .then((page) => {
        const canvas = canvasRef.current
        if (cancelled || !canvas) return
        // Scale to the slot's width at device resolution, so the paper stays
        // sharp when the browser fits it back down.
        const base = page.getViewport({ scale: 1 })
        const slot = canvas.parentElement?.clientWidth ?? base.width
        const scale = (slot / base.width) * (window.devicePixelRatio || 1)
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height
        rendered.current = true
        return page.render({ canvas, viewport }).promise
      })
      .catch(() => {
        /* a page that fails to draw stays a blank slot */
      })
    return () => {
      cancelled = true
    }
  }, [active, doc, pageNo])

  return (
    <div className="rfv__page">
      <canvas ref={canvasRef} className="rfv__canvas" />
    </div>
  )
}
