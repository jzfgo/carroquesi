import './Loading.css'

export function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="loading">
      <span className="loading__spinner" />
    </div>
  )
}
