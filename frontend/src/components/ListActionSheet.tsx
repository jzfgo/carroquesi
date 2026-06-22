import { Pencil, Receipt, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSwipeToDismiss } from "../hooks/useSwipeToDismiss";
import type { ApiList } from "../types";
import "./ListActionSheet.css";

type SubState = "actions" | "rename" | "confirm-delete";

interface Props {
  list: ApiList;
  isOwner: boolean;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onReceiptScan?: () => void;
  onClose: () => void;
}

export function ListActionSheet({
  list,
  isOwner,
  onRename,
  onDelete,
  onReceiptScan,
  onClose,
}: Props) {
  const [subState, setSubState] = useState<SubState>("actions");
  const [renameValue, setRenameValue] = useState(list.name);
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
    <div className="list-action-sheet__overlay" onClick={onClose} />
  );

  if (subState === "actions") {
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
          <p className="list-action-sheet__list-name">{list.name}</p>
          <button
            className="list-action-sheet__action"
            onClick={() => setSubState("rename")}
          >
            <Pencil size={18} /> Renombrar
          </button>
          {onReceiptScan && (
            <button
              className="list-action-sheet__action"
              onClick={() => {
                onReceiptScan();
                onClose();
              }}
            >
              <Receipt size={18} /> Escanear ticket
            </button>
          )}
          {isOwner && (
            <button
              className="list-action-sheet__action list-action-sheet__action--danger"
              onClick={() => setSubState("confirm-delete")}
            >
              <Trash2 size={18} /> Eliminar lista
            </button>
          )}
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
                if (e.key === "Enter" && trimmed) onRename(trimmed);
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
        className="list-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar eliminación"
        ref={sheetRef}
      >
        <div className="list-action-sheet__handle" {...swipe} />
        <p className="list-action-sheet__list-name">{list.name}</p>
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
          onClick={() => setSubState("actions")}
          aria-label="Cancelar"
        >
          Cancelar
        </button>
      </div>
    </>
  );
}
