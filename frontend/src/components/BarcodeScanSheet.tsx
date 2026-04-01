import './BarcodeScanSheet.css'
import type { BarcodeRead } from '../types'

interface Props {
  product: BarcodeRead
  onAdd: (item: { name: string; brand: string | null; store: string | null }) => void
  onEdit: (prefill: string) => void
  onClose: () => void
}

function buildPrefill(product: BarcodeRead): string {
  const parts = [product.name]
  if (product.brand) parts.push(`#${product.brand}`)
  return parts.join(' ')
}

export function BarcodeScanSheet({ product, onAdd, onEdit, onClose }: Props) {
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
                      <span key={s} className="bss__tag bss__tag--store">
                        <span aria-hidden="true">🏪</span> <span>{s}</span>
                      </span>
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
            onClick={() => onAdd({ name: product.name, brand: product.brand, store: product.stores[0] ?? null })}
          >
            Añadir a la lista
          </button>
        </div>
      </div>
    </>
  )
}
