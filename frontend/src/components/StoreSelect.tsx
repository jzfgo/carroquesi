import { ChevronDown, Store } from 'lucide-react'
import { storeKey } from '../lib/storeKey'
import './StoreSelect.css'

/** The «+ otra» entry's value. Callers whose new-store step is a visible
 *  state (an inline field) may pass it as `value` to show the entry as the
 *  current choice while that step is open. */
export const ADD_STORE = '__add_store__'

interface Props {
  /** Store display names, deduped by key, in offer order. */
  options: string[]
  /** The chosen store ('' for none, ADD_STORE while an add step is open).
   *  Matched against options by store key, so a raw typed spelling still
   *  lights up its registry name. */
  value: string
  /** A store was picked — or '' when the emptyLabel choice was. */
  onSelect: (value: string) => void
  /** The «+ otra» entry was picked. */
  onAddNew: () => void
  /** Present = no-store is a legitimate choice, offered first as this label. */
  emptyLabel?: string
  className?: string
}

/**
 * The store choice as a native dropdown (styled select): the phone's own
 * picker does the listing, so any number of stores costs one row. Chips
 * wrapped to two rows from the third store on.
 */
export function StoreSelect({
  options,
  value,
  onSelect,
  onAddNew,
  emptyLabel,
  className,
}: Props) {
  const resolved =
    value === '' || value === ADD_STORE
      ? value
      : (options.find((o) => storeKey(o) === storeKey(value)) ?? value)
  // A current value from outside the offer (e.g. a saved store the item no
  // longer mentions) still needs an option to be shown and kept selectable.
  const orphan =
    resolved !== '' && resolved !== ADD_STORE && !options.includes(resolved)

  return (
    <span className={`store-select${className ? ` ${className}` : ''}`}>
      <Store size={13} className="store-select__icon" aria-hidden />
      <select
        className="store-select__control"
        value={resolved}
        aria-label="Tienda"
        onChange={(e) => {
          const v = e.target.value
          if (v === ADD_STORE) onAddNew()
          else onSelect(v)
        }}
      >
        {emptyLabel != null ? (
          <option value="">{emptyLabel}</option>
        ) : (
          resolved === '' && (
            <option value="" disabled hidden>
              Elige tienda
            </option>
          )
        )}
        {orphan && <option value={resolved}>{resolved}</option>}
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={ADD_STORE}>+ otra</option>
      </select>
      <ChevronDown size={14} className="store-select__chevron" aria-hidden />
    </span>
  )
}
