import { Pencil, Receipt, Star, Store, Trash2, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ListStoreEntry } from '../types'
import './ListActionSheet.css'
import { ListMembersSheet } from './ListMembersSheet'
import { Sheet, type SheetHandle } from './Sheet'

type SubState = 'actions' | 'rename' | 'members' | 'stores' | 'confirm-delete'

const LABELS: Record<Exclude<SubState, 'members'>, string> = {
  actions: 'Opciones de lista',
  rename: 'Renombrar lista',
  stores: 'Tiendas',
  'confirm-delete': 'Confirmar eliminación',
}

interface Props {
  listId: string
  listName: string
  currentUserId: string
  isOwner: boolean
  /** Whether this list is the current user's default (Siri target). */
  isDefault: boolean
  onRename: (newName: string) => void
  onDelete: () => void
  onSetDefault: () => void
  onReceiptScan?: () => void
  onClose: () => void
  /** The member sheet reported a successful self-removal. */
  onLeftList?: () => void
  /** The member sheet got an answer that suggests the list is gone. */
  onListSuspect?: () => void
  /** The list's store registry; absent or empty hides the stores entry. */
  storeEntries?: ListStoreEntry[]
  onRenameStore?: (storeKey: string, displayName: string) => void
}

export function ListActionSheet({
  listId,
  listName,
  currentUserId,
  isOwner,
  isDefault,
  onRename,
  onDelete,
  onSetDefault,
  onReceiptScan,
  onClose,
  onLeftList,
  onListSuspect,
  storeEntries,
  onRenameStore,
}: Props) {
  const [subState, setSubState] = useState<SubState>('actions')
  const [renameValue, setRenameValue] = useState(listName)
  const [editingStoreKey, setEditingStoreKey] = useState<string | null>(null)
  const [storeNameValue, setStoreNameValue] = useState('')
  const sheetRef = useRef<SheetHandle>(null)

  if (subState === 'members') {
    return (
      <ListMembersSheet
        listId={listId}
        currentUserId={currentUserId}
        isOwner={isOwner}
        onClose={() => setSubState('actions')}
        onLeft={onLeftList}
        onListSuspect={onListSuspect}
      />
    )
  }

  const trimmed = renameValue.trim()
  const trimmedStore = storeNameValue.trim()

  return (
    <Sheet
      ref={sheetRef}
      className="list-action-sheet"
      label={LABELS[subState]}
      onClose={onClose}
      // A sub-state is a step inside the sheet: dismissing it goes back to
      // the actions menu, and only the menu itself closes the sheet.
      onDismiss={
        subState === 'actions' ? undefined : () => setSubState('actions')
      }
    >
      {subState === 'actions' && (
        <>
          <p className="list-action-sheet__list-name">{listName}</p>
          {isDefault ? (
            <div
              className="list-action-sheet__action list-action-sheet__action--default"
              aria-disabled="true"
            >
              <Star size={18} fill="currentColor" /> Lista predeterminada
            </div>
          ) : (
            <button
              className="list-action-sheet__action"
              onClick={() => {
                onSetDefault()
                sheetRef.current?.close()
              }}
            >
              <Star size={18} /> Marcar como predeterminada
            </button>
          )}
          <button
            className="list-action-sheet__action"
            onClick={() => setSubState('rename')}
          >
            <Pencil size={18} /> Renombrar
          </button>
          <button
            className="list-action-sheet__action"
            onClick={() => setSubState('members')}
          >
            <Users size={18} /> Gestionar Miembros
          </button>
          {onRenameStore && (storeEntries?.length ?? 0) > 0 && (
            <button
              className="list-action-sheet__action"
              onClick={() => setSubState('stores')}
            >
              <Store size={18} /> Tiendas
            </button>
          )}
          {onReceiptScan && (
            <button
              className="list-action-sheet__action"
              onClick={() => {
                onReceiptScan()
                sheetRef.current?.close()
              }}
            >
              <Receipt size={18} /> Escanear ticket
            </button>
          )}
          {isOwner && (
            <button
              className="list-action-sheet__action list-action-sheet__action--danger"
              onClick={() => setSubState('confirm-delete')}
            >
              <Trash2 size={18} /> Eliminar lista
            </button>
          )}
        </>
      )}

      {subState === 'rename' && (
        <>
          <p className="list-action-sheet__list-name">
            <Pencil size={16} /> Renombrar lista
          </p>
          <div className="list-action-sheet__input-row">
            <input
              className="list-action-sheet__input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmed) onRename(trimmed)
              }}
              autoFocus
              aria-label="Nombre de la lista"
            />
            <button
              className="list-action-sheet__save-btn"
              onClick={() => onRename(trimmed)}
              disabled={!trimmed}
              aria-label="Guardar"
            >
              Guardar
            </button>
          </div>
          <button
            className="list-action-sheet__cancel-link"
            onClick={() => setSubState('actions')}
            aria-label="Cancelar"
          >
            Cancelar
          </button>
        </>
      )}

      {subState === 'stores' && (
        <>
          <p className="list-action-sheet__list-name">
            <Store size={16} /> Tiendas
          </p>
          {(storeEntries ?? []).map((entry) =>
            editingStoreKey === entry.store_key ? (
              <div
                key={entry.store_key}
                className="list-action-sheet__input-row"
              >
                <input
                  className="list-action-sheet__input"
                  type="text"
                  value={storeNameValue}
                  onChange={(e) => setStoreNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && trimmedStore) {
                      onRenameStore?.(entry.store_key, trimmedStore)
                      setEditingStoreKey(null)
                    }
                  }}
                  autoFocus
                  aria-label={`Nombre de ${entry.display_name}`}
                />
                <button
                  className="list-action-sheet__save-btn"
                  onClick={() => {
                    onRenameStore?.(entry.store_key, trimmedStore)
                    setEditingStoreKey(null)
                  }}
                  disabled={!trimmedStore}
                  aria-label="Guardar"
                >
                  Guardar
                </button>
              </div>
            ) : (
              <button
                key={entry.store_key}
                className="list-action-sheet__action"
                onClick={() => {
                  setEditingStoreKey(entry.store_key)
                  setStoreNameValue(entry.display_name)
                }}
                aria-label={`Renombrar ${entry.display_name}`}
              >
                <Pencil size={18} /> {entry.display_name}
              </button>
            ),
          )}
          <button
            className="list-action-sheet__cancel-link"
            onClick={() => {
              setEditingStoreKey(null)
              setSubState('actions')
            }}
            aria-label="Volver"
          >
            Volver
          </button>
        </>
      )}

      {subState === 'confirm-delete' && (
        <>
          <p className="list-action-sheet__list-name">{listName}</p>
          <p className="list-action-sheet__warning">
            Se eliminarán todos los productos. Esta acción no se puede deshacer.
          </p>
          <button
            className="list-action-sheet__confirm-btn"
            onClick={onDelete}
            aria-label="Sí, eliminar lista"
          >
            Sí, eliminar lista
          </button>
          <button
            className="list-action-sheet__cancel-btn"
            onClick={() => setSubState('actions')}
            aria-label="Cancelar"
          >
            Cancelar
          </button>
        </>
      )}
    </Sheet>
  )
}
