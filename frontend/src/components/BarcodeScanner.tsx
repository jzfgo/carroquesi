import { BarcodeDetectorPolyfill } from '@undecaf/barcode-detector-polyfill'
import { CameraOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ApiError, getBarcode } from '../lib/api'
import type { BarcodeRead } from '../types'
import './BarcodeScanner.css'

type DetectorConstructor = typeof BarcodeDetectorPolyfill

interface Props {
  getToken: () => Promise<string>
  onResult: (product: BarcodeRead) => void
  onError: (message: string) => void
  onClose: () => void
}

export function BarcodeScanner({
  getToken,
  onResult,
  onError,
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
    const detector = new DetectorClass({ formats: ['ean_8', 'ean_13'] })

    async function scan() {
      if (!scanningRef.current || !videoRef.current) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          scanningRef.current = false
          stopStream()
          try {
            const product = await getBarcode(getToken, barcodes[0].rawValue)
            onResult(product)
          } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
              onError('Producto no encontrado')
            } else if (err instanceof ApiError && err.status === 503) {
              onError('Servicio no disponible, inténtalo más tarde')
            } else {
              onError('Error al buscar el producto')
            }
          }
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
    return (
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
      </div>
    )
  }

  return (
    <div className="barcode-scanner">
      <video
        ref={videoRef}
        className="barcode-scanner__video"
        playsInline
        muted
      />
      <div className="barcode-scanner__overlay">
        <div className="barcode-scanner__frame" />
        <p className="barcode-scanner__hint">Apunta al código de barras</p>
      </div>
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
    </div>
  )
}
