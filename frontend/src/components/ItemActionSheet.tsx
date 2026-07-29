import { Coins, Pencil, RotateCcw, Store, Tag, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { formatPrice } from '../lib/formatPrice'
import type { ListItem, Member, TagField } from '../types'
import './ItemActionSheet.css'

type SubState = 'actions' | 'rename' | 'confirm-delete'

interface Props {
  item: ListItem
  members?: Map<string, Member>
  onRename: (newName: string) => void
  onDelete: () => void
  onClose: () => void
  purchased?: boolean
  onClone?: () => void
  /** The row no longer carries chips for these, so the sheet does. */
  onTagClick?: (field: TagField | 'stores') => void
  onPriceClick?: () => void
}

export function ItemActionSheet({
  item,
  members,
  onRename,
  onDelete,
  onClose,
  purchased,
  onClone,
  onTagClick,
  onPriceClick,
}: Props) {
  const [subState, setSubState] = useState<SubState>('actions')
  const [renameValue, setRenameValue] = useState(item.name)
  // Attribution moves here with everything else the row stopped carrying. In a
  // shared house it matters who put a line on the list; it just does not matter
  // enough to spend a column of every row on.
  const addedBy = members?.get(item.added_by)?.displayName ?? null
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const overlay = (
    <div className="item-action-sheet__overlay" onClick={onClose} />
  )

  if (subState === 'actions') {
    return (
      <>
        {overlay}
        <div
          className="item-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Opciones del producto"
          ref={subState === 'actions' ? sheetRef : undefined}
        >
          <div className="item-action-sheet__handle" {...swipe} />
          <p className="item-action-sheet__item-name">{item.name}</p>
          {addedBy && (
            <p className="item-action-sheet__added-by">Lo apuntó {addedBy}</p>
          )}
          {(onTagClick || onPriceClick) && (
            <div className="item-action-sheet__details">
              {onTagClick && (
                <button
                  className="item-action-sheet__detail"
                  onClick={() => onTagClick('brand')}
                >
                  <Tag size={16} aria-hidden />
                  <span className="item-action-sheet__detail-label">Marca</span>
                  <span
                    className={`item-action-sheet__detail-value${item.brand ? '' : ' item-action-sheet__detail-value--empty'}`}
                  >
                    {item.brand ?? 'Sin marca'}
                  </span>
                </button>
              )}
              {onTagClick && (
                <button
                  className="item-action-sheet__detail"
                  onClick={() => onTagClick('stores')}
                >
                  <Store size={16} aria-hidden />
                  <span className="item-action-sheet__detail-label">
                    Tienda
                  </span>
                  <span
                    className={`item-action-sheet__detail-value${item.stores.length ? '' : ' item-action-sheet__detail-value--empty'}`}
                  >
                    {item.stores.length
                      ? item.stores.join(' · ')
                      : 'Cualquiera'}
                  </span>
                </button>
              )}
              {onPriceClick && (
                <button
                  className="item-action-sheet__detail"
                  onClick={onPriceClick}
                >
                  <Coins size={16} aria-hidden />
                  <span className="item-action-sheet__detail-label">
                    Precio
                  </span>
                  <span
                    className={`item-action-sheet__detail-value${item.price != null ? ' item-action-sheet__detail-value--mono' : ' item-action-sheet__detail-value--empty'}`}
                  >
                    {item.price != null
                      ? formatPrice(item.price, item.price_per)
                      : 'Sin precio'}
                  </span>
                </button>
              )}
            </div>
          )}
          {!purchased && (
            <button
              className="item-action-sheet__action"
              onClick={() => setSubState('rename')}
            >
              <Pencil size={18} /> Renombrar
            </button>
          )}
          {purchased && onClone && (
            <button className="item-action-sheet__action" onClick={onClone}>
              <RotateCcw size={18} /> Comprar de nuevo
            </button>
          )}
          {!item.purchase_filed && (
            <button
              className="item-action-sheet__action item-action-sheet__action--danger"
              onClick={() => setSubState('confirm-delete')}
            >
              <Trash2 size={18} /> Eliminar producto
            </button>
          )}
        </div>
      </>
    )
  }

  if (subState === 'rename') {
    const trimmed = renameValue.trim()
    return (
      <>
        {overlay}
        <div
          className="item-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Renombrar producto"
          ref={sheetRef}
        >
          <div className="item-action-sheet__handle" {...swipe} />
          <p className="item-action-sheet__item-name">
            <Pencil size={16} /> Renombrar producto
          </p>
          <div className="item-action-sheet__input-row">
            <input
              className="item-action-sheet__input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmed) onRename(trimmed)
              }}
              autoFocus
              aria-label="Nombre del producto"
            />
            <button
              className="item-action-sheet__save-btn"
              onClick={() => onRename(trimmed)}
              disabled={!trimmed}
              aria-label="Guardar"
            >
              Guardar
            </button>
          </div>
          <button
            className="item-action-sheet__cancel-link"
            onClick={() => setSubState('actions')}
            aria-label="Cancelar"
          >
            Cancelar
          </button>
        </div>
      </>
    )
  }

  // subState === 'confirm-delete'
  return (
    <>
      {overlay}
      <div
        className="item-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar eliminación"
        ref={sheetRef}
      >
        <div className="item-action-sheet__handle" {...swipe} />
        <p className="item-action-sheet__item-name">{item.name}</p>
        <p className="item-action-sheet__warning">
          Esta acción no se puede deshacer.
        </p>
        <button
          className="item-action-sheet__confirm-btn"
          onClick={onDelete}
          aria-label="Sí, eliminar"
        >
          Sí, eliminar
        </button>
        <button
          className="item-action-sheet__cancel-btn"
          onClick={() => setSubState('actions')}
          aria-label="Cancelar"
        >
          Cancelar
        </button>
      </div>
    </>
  )
}
