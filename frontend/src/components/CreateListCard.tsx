import { Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import './CreateListCard.css'
import { Mascot } from './Mascot'

interface Props {
  isFirst?: boolean
  /** Resolves `true` once the list exists, `false` if it does not.
   *
   *  `false` covers both refusal (offline) and failure (the request threw).
   *  The card treats them identically because from here they are identical —
   *  no list was created, so what the user typed is still the only copy of it.
   *  Which one it was, and whether retrying is worth it, is the toast's job.
   *
   *  It has to come back as a value because this card owns `name` and
   *  `expanded`: the parent cannot decline to clear state it does not hold.
   *  Compare `handleFeedbackSubmit`, whose bare `return` is refusal enough
   *  only because the sheet's open flag lives in the parent.
   *
   *  **Must settle, never reject.** The card calls this from `void
   *  handleSubmit()`, so a rejection becomes an unhandled one with no toast —
   *  which is the bug this contract exists to make unrepresentable. Catch at
   *  the source and answer `false`.
   */
  onCreate: (name: string) => Promise<boolean>
}

export function CreateListCard({ isFirst, onCreate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  // Which submission the card is currently on. A ref rather than state because
  // nothing renders from it and an in-flight `handleSubmit` has to read the
  // *current* value, not the one its closure captured.
  const submission = useRef(0)

  if (!expanded) {
    // First run has nothing behind it, so the mascot is allowed and the action
    // is centred under it. With lists already on screen this is instead the
    // last row of the panel, drawn like every other row.
    if (isFirst) {
      return (
        <div className="create-list-card--first">
          <Mascot size={120} />
          <p className="create-list-card__empty">Aún no tienes listas</p>
          <button
            className="create-list-card create-list-card--cta"
            onClick={() => setExpanded(true)}
          >
            Crea tu primera lista
          </button>
        </div>
      )
    }
    return (
      <button
        className="create-list-card create-list-card--row"
        onClick={() => setExpanded(true)}
      >
        <Plus size={19} strokeWidth={2.2} aria-hidden />
        Nueva lista
      </button>
    )
  }

  // Collapsing abandons whatever is in flight. It has to say so out loud,
  // because collapsing does *not* unmount this component — `!expanded` above
  // is a render branch, and the card is rendered in a fixed position with no
  // changing `key`, so the instance and its `creating` survive. Without the
  // reset, escaping a create that never settles would leave the reopened card
  // permanently inert: button disabled, Enter guarded, nothing explaining it.
  const collapse = () => {
    submission.current++
    setExpanded(false)
    setName('')
    setCreating(false)
  }

  const handleSubmit = async () => {
    // `creating` is checked here, not only on the button's `disabled`. Enter
    // reaches this directly from the input and leaves focus there, which is
    // where someone sits while a slow create is in flight — so the button
    // being greyed out stops nothing. Two submits is two lists: the endpoint
    // has no idempotency key (JAV-69).
    if (creating || !name.trim()) return
    const mine = submission.current
    setCreating(true)
    try {
      const created = await onCreate(name.trim())
      // Abandoned while we waited. Everything below writes to a card the user
      // has since closed and may have reopened and retyped, so a late success
      // would clear a name that belongs to a different submission — JAV-61's
      // own failure, arriving from behind.
      if (submission.current !== mine) return
      // Only a confirmed create clears the field. What the user typed is work,
      // and a refusal leaves nothing on the server to come back to — so the
      // name stays on screen with the card open, ready to send again.
      if (!created) return
      setName('')
      setExpanded(false)
    } finally {
      // Not unconditional: `collapse` already cleared it for the new
      // submission, and clearing it here would be this one reaching forward.
      if (submission.current === mine) setCreating(false)
    }
  }

  return (
    <div className="create-list-card create-list-card--expanded">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la lista"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit()
          if (e.key === 'Escape') collapse()
        }}
      />
      <button
        disabled={!name.trim() || creating}
        onClick={() => void handleSubmit()}
      >
        Crear lista
      </button>
      <button
        className="create-list-card--cancel"
        onClick={collapse}
        aria-label="Cancelar"
      >
        <X size={16} />
      </button>
    </div>
  )
}
