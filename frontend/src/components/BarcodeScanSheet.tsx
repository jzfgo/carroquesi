import { useState } from 'react'
import './BarcodeScanSheet.css'
import type { BarcodeRead } from '../types'

interface Props {
  product: BarcodeRead
  onAdd: (item: { name: string; brand: string | null; stores: string[] }) => void
  onEdit: (prefill: string) => void
  onClose: () => void
}

function buildPrefill(product: BarcodeRead): string {
  const parts = [product.name]
  if (product.brand) parts.push(`#${product.brand}`)
  return parts.join(' ')
}

export function BarcodeScanSheet({ product, onAdd, onEdit, onClose }: Props) {
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set())

  function toggleStore(store: string) {
    setSelectedStores(prev => {
      const next = new Set(prev)
      if (next.has(store)) next.delete(store)
      else next.add(store)
      return next
    })
  }

  return (
    <>
      <div className="bss__overlay" onClick={onClose} />
      <div className="bss">
        <div className="bss__header">Producto encontrado</div>

        <div className="bss__product-row">
          <div className="bss__product-info">
            <div className="bss__name">{product.name}</div>
            {(product.brand || product.stores.length > 0) && (
              <div className="bss__tags">
                {product.brand && (
                  <span className="bss__tag">🏷️ {product.brand}</span>
                )}
                {product.stores.length > 0 && (
                  <div className="bss__store-chips" data-testid="store-chips">
                    {product.stores.map(s => (
                      <button
                        key={s}
                        className={`bss__tag bss__tag--store${selectedStores.has(s) ? ' bss__tag--store-selected' : ''}`}
                        onClick={() => toggleStore(s)}
                        aria-pressed={selectedStores.has(s)}
                        aria-label={s}
                      >
                        <span aria-hidden="true">🏪</span> <span>{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="bss__edit"
            onClick={() => onEdit(buildPrefill(product))}
            aria-label="Editar"
          >
            ✏️
          </button>
        </div>

        <div className="bss__actions">
          <button className="bss__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="bss__add"
            onClick={() => onAdd({
              name: product.name,
              brand: product.brand,
              stores: product.stores.filter(s => selectedStores.has(s)),
            })}
          >
            Añadir a la lista
          </button>
        </div>
      </div>
    </>
  )
}
