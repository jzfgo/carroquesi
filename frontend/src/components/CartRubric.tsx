import './Stamp.css'

interface Props {
  count: number
  /** Absent until closing a trip exists; the rubric then prints without a
   *  stamp, which is the correct empty-handed state rather than a dead
   *  control. */
  onClose?: () => void
}

/**
 * The head of the cart: what is in it, and the stamp that closes it. Printed
 * rather than written, because the pad brought this line — the household wrote
 * the items, not the heading over them (rule 15).
 *
 * The whole 48px row is the target; the 26px stamp inside it is a mark.
 */
export function CartRubric({ count, onClose }: Props) {
  const rubric = (
    <span className="stamp-row__rubric">En el carro · {count}</span>
  )

  if (!onClose) {
    return <div className="stamp-row">{rubric}</div>
  }

  return (
    <button className="stamp-row" onClick={onClose}>
      {rubric}
      <span className="stamp">Cerrar compra</span>
    </button>
  )
}
