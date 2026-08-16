import { useEffect } from 'react'
import { ENVIRONMENT_LABEL } from '../lib/environment'

/** Always-on band naming the deployment; production sets no label. */
export function EnvironmentBand() {
  useEffect(() => {
    if (!ENVIRONMENT_LABEL) return
    document.body.classList.add('has-environment-band')
    return () => document.body.classList.remove('has-environment-band')
  }, [])

  if (!ENVIRONMENT_LABEL) return null
  return (
    <div className="environment-band" role="note">
      {ENVIRONMENT_LABEL}
    </div>
  )
}
