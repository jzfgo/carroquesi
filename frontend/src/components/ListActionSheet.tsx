import {
  Palette,
  Pencil,
  Receipt,
  Smile,
  Star,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBoard } from '../hooks/useBoard'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { BoardPicker } from './BoardPicker'
import { EmojiPickerSheet } from './EmojiPickerSheet'
import './ListActionSheet.css'
import { ListMembersSheet } from './ListMembersSheet'

type SubState =
  'actions' | 'board' | 'emoji' | 'rename' | 'members' | 'confirm-delete'

interface Props {
  listId: string
  listName: string
  currentUserId: string
  isOwner: boolean
  /** Whether this list is the current user's default (Siri target). */
  isDefault: boolean
  listEmoji?: string | null
  onEmojiChange?: (emoji: string | null) => void
  onRename: (newName: string) => void
  onDelete: () => void
  /** The current user left this list from the members sheet. */
  onLeft?: () => void
  onSetDefault: () => void
  onReceiptScan?: () => void
  onClose: () => void
}

export function ListActionSheet({
  listId,
  listName,
  currentUserId,
  isOwner,
  isDefault,
  listEmoji = null,
  onEmojiChange,
  onRename,
  onDelete,
  onLeft,
  onSetDefault,
  onReceiptScan,
  onClose,
}: Props) {
  const [subState, setSubState] = useState<SubState>('actions')
  const [board, chooseBoard] = useBoard(currentUserId, listId)
  const [renameValue, setRenameValue] = useState(listName)
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (subState === 'actions') onClose()
      // 'members' and 'emoji' manage their own Escape; the rest navigate back
      else if (subState !== 'members' && subState !== 'emoji')
        setSubState('actions')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, subState])

  const overlay = (
    <div className="list-action-sheet__overlay" onClick={onClose} />
  )

  if (subState === 'actions') {
    return (
      <>
        {overlay}
        <div
          className="list-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Opciones de lista"
          ref={sheetRef}
        >
          <div className="list-action-sheet__handle" {...swipe} />
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
                onClose()
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
          {/* The emoji is the list's shared identity — what the whole household
              sees and points at — so it is edited here, next to the name, and
              not from the panel, which is only a way in. */}
          {onEmojiChange && (
            <button
              className="list-action-sheet__action"
              onClick={() => setSubState('emoji')}
            >
              <Smile size={18} /> Emoji
            </button>
          )}
          {/* Not gated on isOwner: the board is the one thing here that is
              yours rather than the household's, so every member sets their
              own and nobody else ever sees it (rule 20). */}
          <button
            className="list-action-sheet__action"
            onClick={() => setSubState('board')}
          >
            <Palette size={18} /> Tablero
          </button>
          <button
            className="list-action-sheet__action"
            onClick={() => setSubState('members')}
          >
            <Users size={18} /> Gestionar Miembros
          </button>
          {onReceiptScan && (
            <button
              className="list-action-sheet__action"
              onClick={() => {
                onReceiptScan()
                onClose()
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
          className="list-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Renombrar lista"
          ref={sheetRef}
        >
          <div className="list-action-sheet__handle" {...swipe} />
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
        </div>
      </>
    )
  }

  if (subState === 'board') {
    return (
      <>
        {overlay}
        <div
          className="list-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Tablero de la lista"
          ref={sheetRef}
        >
          <div className="list-action-sheet__handle" {...swipe} />
          <p className="list-action-sheet__list-name">{listName}</p>
          <BoardPicker
            value={board}
            listName={listName}
            // Written straight through. There is nothing to confirm: it is a
            // preference, it travels nowhere, and the preview under the
            // swatches has already shown the result.
            onChange={chooseBoard}
          />
          <button
            className="list-action-sheet__cancel-link"
            onClick={() => setSubState('actions')}
          >
            Hecho
          </button>
        </div>
      </>
    )
  }

  if (subState === 'emoji') {
    return (
      <EmojiPickerSheet
        current={listEmoji}
        onSelect={(emoji) => {
          onEmojiChange?.(emoji)
          setSubState('actions')
        }}
        onClose={() => setSubState('actions')}
      />
    )
  }

  if (subState === 'members') {
    return (
      <ListMembersSheet
        listId={listId}
        currentUserId={currentUserId}
        isOwner={isOwner}
        onClose={() => setSubState('actions')}
        onLeft={onLeft}
      />
    )
  }

  // subState === 'confirm-delete'
  return (
    <>
      {overlay}
      <div
        className="list-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar eliminación"
        ref={sheetRef}
      >
        <div className="list-action-sheet__handle" {...swipe} />
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
      </div>
    </>
  )
}
