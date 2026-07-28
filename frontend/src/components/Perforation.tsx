import './Perforation.css'

/**
 * The line the sheet tears along, between what is still on the list and what is
 * already in the cart. It is not a divider that happens to look perforated —
 * the cart really does come away here, at midnight, and become a purchase.
 *
 * Purely visual, so it is hidden from assistive tech: the two groups it
 * separates already announce themselves by their own headings.
 */
export function Perforation() {
  return (
    <div className="perf" aria-hidden>
      <span className="perf__notch perf__notch--start" />
      <div className="perf__holes" />
      <span className="perf__notch perf__notch--end" />
    </div>
  )
}
