import { ScanBarcode } from 'lucide-react'
import './WeightChip.css'

interface Props {
  /** What the line prints, so a screen reader tells the chips apart. */
  lineName: string
  onClick: () => void
  className?: string
}

/**
 * The dashed «Peso» chip on a line that looks weighed: one tap opens the
 * label scan for that line. The receipt review (13a) and the close table
 * (10b) share it.
 */
export function WeightChip({ lineName, onClick, className }: Props) {
  return (
    <button
      type="button"
      className={`weight-chip${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={`Escanear la etiqueta de «${lineName}»`}
    >
      <ScanBarcode size={14} aria-hidden />
      Peso
    </button>
  )
}

/** The dashed «Escanear etiqueta» action in a line's detail (13b, 10d). */
export function ScanLabelButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="scan-label-button" onClick={onClick}>
      <ScanBarcode size={17} aria-hidden />
      Escanear etiqueta
    </button>
  )
}
