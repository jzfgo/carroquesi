import { ENVIRONMENT_LABEL } from '../lib/environment'

/** Always-on band naming the deployment; production sets no label. */
export function EnvironmentBand() {
  if (!ENVIRONMENT_LABEL) return null
  return (
    <div className="environment-band" role="note">
      {ENVIRONMENT_LABEL}
    </div>
  )
}
