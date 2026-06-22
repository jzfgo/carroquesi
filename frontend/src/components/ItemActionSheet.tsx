import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSwipeToDismiss } from "../hooks/useSwipeToDismiss";
import type { ListItem } from "../types";
import "./ItemActionSheet.css";

type SubState = "actions" | "rename" | "confirm-delete";

interface Props {
  item: ListItem;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onClose: () => void;
  purchased?: boolean;
  onClone?: () => void;
}

export function ItemActionSheet({
  item,
  onRename,
  onDelete,
  onClose,
  purchased,
  onClone,
}: Props) {
  const [subState, setSubState] = useState<SubState>("actions");
  const [renameValue, setRenameValue] = useState(item.name);
  const sheetRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDismiss(sheetRef, onClose);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const overlay = (
    <div className="item-action-sheet__overlay" onClick={onClose} />
  );

  if (subState === "actions") {
    return (
      <>
        {overlay}
        <div
          className="item-action-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Opciones del producto"
          ref={subState === "actions" ? sheetRef : undefined}
        >
          <div className="item-action-sheet__handle" {...swipe} />
          <p className="item-action-sheet__item-name">{item.name}</p>
          {!purchased && (
            <button
              className="item-action-sheet__action"
              onClick={() => setSubState("rename")}
            >
              <Pencil size={18} /> Renombrar
            </button>
          )}
          {purchased && onClone && (
            <button className="item-action-sheet__action" onClick={onClone}>
              <RotateCcw size={18} /> Comprar de nuevo
            </button>
          )}
          <button
            className="item-action-sheet__action item-action-sheet__action--danger"
            onClick={() => setSubState("confirm-delete")}
          >
            <Trash2 size={18} /> Eliminar producto
          </button>
        </div>
      </>
    );
  }

  if (subState === "rename") {
    const trimmed = renameValue.trim();
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
                if (e.key === "Enter" && trimmed) onRename(trimmed);
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
            onClick={() => setSubState("actions")}
            aria-label="Cancelar"
          >
            Cancelar
          </button>
        </div>
      </>
    );
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
          onClick={() => setSubState("actions")}
          aria-label="Cancelar"
        >
          Cancelar
        </button>
      </div>
    </>
  );
}
