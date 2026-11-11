import { BarcodeDetectorPolyfill } from '@undecaf/barcode-detector-polyfill'
import { CameraOff, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './BarcodeScanner.css'

type DetectorConstructor = typeof BarcodeDetectorPolyfill

interface Props {
  /** Barcode formats, as the BarcodeDetector API names them. */
  formats: string[]
  hint: string
  /** What sits at the top of the view, above the camera. */
  caption?: ReactNode
  /** The frame's shape: a wide one fits a label's long barcode. */
  wide?: boolean
  /** The first read. The camera has already stopped. */
  onDetect: (rawValue: string) => void
  onClose: () => void
}

/**
 * The full-screen camera: it reads one barcode and stops. It renders on the
 * page, not where it is mounted, because a sheet's panel slides with a
 * transform, and a fixed element inside a transform is placed against it.
 */
export function CameraScanner({
  formats,
  hint,
  caption,
  wide = false,
  onDetect,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true)
  const [cameraError, setCameraError] = useState(false)

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    scanningRef.current = true // reset in case Strict Mode ran cleanup before remounting
    // Resolve at runtime so test stubs applied in beforeEach take effect
    const g = globalThis as unknown as {
      BarcodeDetector?: DetectorConstructor
    }
    const DetectorClass: DetectorConstructor =
      typeof g.BarcodeDetector !== 'undefined'
        ? g.BarcodeDetector!
        : BarcodeDetectorPolyfill
    const detector = new DetectorClass({ formats })

    async function scan() {
      if (!scanningRef.current || !videoRef.current) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          scanningRef.current = false
          stopStream()
          onDetect(barcodes[0].rawValue)
          return
        }
      } catch {
        // Detection failed this frame — continue
      }
      if (scanningRef.current) requestAnimationFrame(scan)
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try {
            videoRef.current.play()?.catch(() => {})
          } catch {
            /* not supported */
          }
          requestAnimationFrame(scan)
        }
      })
      .catch(() => setCameraError(true))

    return () => {
      scanningRef.current = false
      stopStream()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (cameraError) {
    return createPortal(
      <div className="barcode-scanner barcode-scanner--error">
        <CameraOff size={32} />
        <p>No se pudo acceder a la cámara.</p>
        <button
          className="barcode-scanner__error-btn"
          onClick={onClose}
          aria-label="Cerrar escáner"
        >
          Cerrar
        </button>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="barcode-scanner">
      <video
        ref={videoRef}
        className="barcode-scanner__video"
        playsInline
        muted
      />
      <div className="barcode-scanner__overlay">
        <div
          className={`barcode-scanner__frame${
            wide ? ' barcode-scanner__frame--wide' : ''
          }`}
        />
        <p className="barcode-scanner__hint">{hint}</p>
      </div>
      {caption && <div className="barcode-scanner__caption">{caption}</div>}
      <button
        className="barcode-scanner__close"
        aria-label="Cerrar escáner"
        onClick={() => {
          scanningRef.current = false
          stopStream()
          onClose()
        }}
      >
        <X size={20} />
      </button>
    </div>,
    document.body,
  )
}
