import './ProgressBar.css'

interface Props {
  purchased: number
  total: number
}

export function ProgressBar({ purchased, total }: Props) {
  if (total === 0) return null   // hidden when no items per spec
  const pct = Math.round((purchased / total) * 100)
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
