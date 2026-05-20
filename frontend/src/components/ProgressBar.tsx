import './ProgressBar.css'

interface Props {
  purchased: number
  total: number
  variant?: 'primary' | 'success'
}

export function ProgressBar({ purchased, total, variant = 'primary' }: Props) {
  if (total === 0) return null
  const pct = Math.round((purchased / total) * 100)
  return (
    <div
      className={`progress-bar progress-bar--${variant}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
