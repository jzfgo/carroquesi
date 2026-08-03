import { ChevronRight, Pencil, Receipt, Star, Store, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { BOARD_NAMES, type BoardName } from '../lib/boards'
import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import type { ListStoreEntry } from '../types'
import './ListActionSheet.css'
import { ListMembersSheet } from './ListMembersSheet'
import { Sheet, type SheetHandle } from './Sheet'

type SubState = 'actions' | 'members' | 'stores' | 'confirm-delete'

const LABELS: Record<Exclude<SubState, 'members'>, string> = {
  actions: 'Opciones de lista',
  stores: 'Tiendas',
  'confirm-delete': 'Confirmar eliminación',
}

// The invite cap; the members row prints "N de 5" like 21a.
const MEMBER_CAP = 5

interface Props {
  listId: string
  listName: string
  /** The list's emoji (shared identity); null shows the ∅ tile. */
  listEmoji: string | null
  currentUserId: string
  /** The list's owner (lists.owner_id); gates owner-only actions. */
  ownerId: string
  /** Whether this list is the current user's default (Siri target). */
  isDefault: boolean
  /** Member count for the "N de 5" meta; omitted hides the count. */
  memberCount?: number
  /** The caller's board for this list (per-user). Omitted hides the picker
      (e.g. the dashboard, where the board is not orientation-in-context). */
  board?: BoardName
  onBoardChange?: (board: BoardName) => void
  /** Save the name (called on blur/Enter of the top field). */
  onRename: (newName: string) => void
  /** Save the emoji (grid pick; null clears it). */
  onEmojiChange: (emoji: string | null) => void
  onDelete: () => void
  onSetDefault: () => void
  onReceiptScan?: () => void
  onClose: () => void
  /** The member sheet reported a successful self-removal. */
  onLeftList?: () => void
  /** The member sheet got an answer that suggests the list is gone. */
  onListSuspect?: () => void
  /** The list's store registry; absent or empty hides the stores row. */
  storeEntries?: ListStoreEntry[]
  onRenameStore?: (storeKey: string, displayName: string) => void
}

export function ListActionSheet({
  listId,
  listName,
  listEmoji,
  currentUserId,
  ownerId,
  isDefault,
  memberCount,
  board,
  onBoardChange,
  onRename,
  onEmojiChange,
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
  // Seeded once; the sheet is transient, so external name changes needn't sync.
  const [nameValue, setNameValue] = useState(listName)
  const [editingStoreKey, setEditingStoreKey] = useState<string | null>(null)
  const [storeNameValue, setStoreNameValue] = useState('')
  const sheetRef = useRef<SheetHandle>(null)
  const isOwner = ownerId === currentUserId

  if (subState === 'members') {
    return (
      <ListMembersSheet
        listId={listId}
        currentUserId={currentUserId}
        ownerId={ownerId}
        onClose={() => setSubState('actions')}
        onLeft={onLeftList}
        onListSuspect={onListSuspect}
      />
    )
  }

  // Save the name on the way out of the field: no "Guardar", per 21a.
  const commitName = () => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== listName) onRename(trimmed)
  }
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
        <div className="list-options">
          {/* Name and emoji — the two data of a list, edited in place (21a). */}
          <div className="list-options__identity">
            <span className="list-options__emoji-tile" aria-hidden>
              {listEmoji ?? ''}
            </span>
            <input
              className="list-options__name"
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              aria-label="Nombre de la lista"
            />
          </div>

          <div
            className="list-options__emoji-grid"
            role="group"
            aria-label="Emoji de la lista"
          >
            <button
              type="button"
              className={`list-options__emoji list-options__emoji--none${listEmoji === null ? ' list-options__emoji--active' : ''}`}
              onClick={() => onEmojiChange(null)}
              aria-label="Ninguno"
            >
              ∅
            </button>
            {CURATED_EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={`list-options__emoji${emoji === listEmoji ? ' list-options__emoji--active' : ''}`}
                onClick={() => onEmojiChange(emoji)}
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Board picker (37a). Per-user orientation, not shared identity:
              six swatches and a light-proof preview that redraws with the mode
              through the tokens. In-list only (needs the live board + writer). */}
          {board && onBoardChange && (
            <div className="list-options__board">
              <p className="list-options__board-label">Tablero</p>
              <div
                className="list-options__swatches"
                role="group"
                aria-label="Tablero"
              >
                {BOARD_NAMES.map((name) => (
                  <button
                    type="button"
                    key={name}
                    className={`list-options__swatch${name === board ? ' list-options__swatch--active' : ''}`}
                    style={{ background: `var(--board-${name})` }}
                    onClick={() => onBoardChange(name)}
                    aria-label={name}
                    aria-pressed={name === board}
                  />
                ))}
              </div>
              <p className="list-options__board-note">
                El tablero es tuyo — cada miembro ve el suyo. El nombre y el
                emoji son de la lista.
              </p>
            </div>
          )}

          {/* Default is a state, not an action: a switch. Set-only — tapping
              when off makes this the Siri default; there is no unset. */}
          <div className="list-options__row">
            <Star size={18} className="list-options__row-icon" aria-hidden />
            <span className="list-options__row-label">
              Lista predeterminada
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isDefault}
              className={`list-options__switch${isDefault ? ' list-options__switch--on' : ''}`}
              onClick={() => {
                if (!isDefault) onSetDefault()
              }}
              aria-label="Lista predeterminada"
            >
              <span className="list-options__switch-knob" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            className="list-options__row list-options__row--link"
            onClick={() => setSubState('members')}
          >
            <Users size={18} className="list-options__row-icon" aria-hidden />
            <span className="list-options__row-label">Miembros</span>
            <span className="list-options__row-meta">
              {memberCount != null && (
                <span className="list-options__count">
                  {memberCount} de {MEMBER_CAP}
                </span>
              )}
              <ChevronRight size={14} aria-hidden />
            </span>
          </button>

          {onRenameStore && (storeEntries?.length ?? 0) > 0 && (
            <button
              type="button"
              className="list-options__row list-options__row--link"
              onClick={() => setSubState('stores')}
            >
              <Store size={18} className="list-options__row-icon" aria-hidden />
              <span className="list-options__row-label">Tiendas</span>
              <span className="list-options__row-meta">
                <span className="list-options__count">
                  {storeEntries?.length}
                </span>
                <ChevronRight size={14} aria-hidden />
              </span>
            </button>
          )}

          {onReceiptScan && (
            <button
              type="button"
              className="list-options__row"
              onClick={() => {
                onReceiptScan()
                sheetRef.current?.close()
              }}
            >
              <Receipt
                size={18}
                className="list-options__row-icon"
                aria-hidden
              />
              <span className="list-options__row-label">Escanear ticket</span>
              <span />
            </button>
          )}

          {isOwner && (
            <button
              type="button"
              className="list-options__delete"
              onClick={() => setSubState('confirm-delete')}
            >
              Eliminar lista
            </button>
          )}
        </div>
      )}

      {subState === 'stores' && (
        <div className="list-options">
          <p className="list-options__sub-title">Tiendas</p>
          {(storeEntries ?? []).map((entry) =>
            editingStoreKey === entry.store_key ? (
              <div
                key={entry.store_key}
                className="list-options__store-row list-options__store-row--editing"
              >
                <input
                  className="list-options__store-input"
                  type="text"
                  value={storeNameValue}
                  onChange={(e) => setStoreNameValue(e.target.value)}
                  onBlur={() => {
                    if (trimmedStore)
                      onRenameStore?.(entry.store_key, trimmedStore)
                    setEditingStoreKey(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  autoFocus
                  aria-label={`Nombre de ${entry.display_name}`}
                />
              </div>
            ) : (
              <button
                type="button"
                key={entry.store_key}
                className="list-options__store-row"
                onClick={() => {
                  setEditingStoreKey(entry.store_key)
                  setStoreNameValue(entry.display_name)
                }}
                aria-label={`Renombrar ${entry.display_name}`}
              >
                <span className="list-options__store-name">
                  {entry.display_name}
                </span>
                <Pencil
                  size={16}
                  className="list-options__store-pencil"
                  aria-hidden
                />
              </button>
            ),
          )}
        </div>
      )}

      {subState === 'confirm-delete' && (
        <div className="list-options">
          <p className="list-options__sub-title">{listName}</p>
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
        </div>
      )}
    </Sheet>
  )
}
