import { ApiError, getBarcode } from '../lib/api'
import type { BarcodeRead } from '../types'
import { CameraScanner } from './CameraScanner'

interface Props {
  getToken: () => Promise<string>
  onResult: (product: BarcodeRead) => void
  /** The code was read but no product answers to it. */
  onNotFound: (ean: string) => void
  onError: (message: string) => void
  onClose: () => void
}

/** Reads a product's EAN and looks the product up. */
export function BarcodeScanner({
  getToken,
  onResult,
  onNotFound,
  onError,
  onClose,
}: Props) {
  async function lookUp(ean: string) {
    try {
      onResult(await getBarcode(getToken, ean))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        onNotFound(ean)
      } else if (err instanceof ApiError && err.status === 503) {
        onError('Servicio no disponible, inténtalo más tarde')
      } else {
        onError('Error al buscar el producto')
      }
    }
  }

  return (
    <CameraScanner
      formats={['ean_8', 'ean_13']}
      hint="Apunta al código de barras"
      onDetect={(ean) => void lookUp(ean)}
      onClose={onClose}
    />
  )
}
