import { useEffect, useRef, useState } from 'react'
import './BarcodeScanner.css'
import { BarcodeDetectorPolyfill } from '@undecaf/barcode-detector-polyfill'
import { getBarcode } from '../lib/api'
import type { BarcodeRead } from '../types'

type DetectorConstructor = typeof BarcodeDetectorPolyfill

interface Props {
  getToken: () => Promise<string>
  onResult: (product: BarcodeRead) => void
  onNotFound: () => void
  onClose: () => void
}

export function BarcodeScanner({ getToken, onResult, onNotFound, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true)
  const [cameraError, setCameraError] = useState(false)

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    // Resolve at runtime so test stubs applied in beforeEach take effect
    const g = globalThis as unknown as { BarcodeDetector?: DetectorConstructor }
    const DetectorClass: DetectorConstructor =
      typeof g.BarcodeDetector !== 'undefined' ? g.BarcodeDetector! : BarcodeDetectorPolyfill
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
          } catch {
            onNotFound()
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
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try { videoRef.current.play()?.catch(() => {}) } catch { /* not supported */ }
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
        <p>No se pudo acceder a la cámara.</p>
        <button onClick={onClose} aria-label="Cerrar escáner">Cerrar</button>
      </div>
    )
  }

  return (
    <div className="barcode-scanner">
      <video ref={videoRef} className="barcode-scanner__video" playsInline muted />
      <div className="barcode-scanner__overlay">
        <div className="barcode-scanner__frame" />
        <p className="barcode-scanner__hint">Apunta al código de barras</p>
      </div>
      <button
        className="barcode-scanner__close"
        aria-label="Cerrar escáner"
        onClick={() => { scanningRef.current = false; stopStream(); onClose() }}
      >
        ✕
      </button>
    </div>
  )
}
