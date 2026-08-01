import { Globe, Pencil, Store, Tag } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { COMMUNITY_PRICE_TOOLTIP, formatPrice } from '../lib/formatPrice'
import { storeKey } from '../lib/storeKey'
import type { BarcodeRead } from '../types'
import './BarcodeScanSheet.css'

interface Props {
  product: BarcodeRead
  initialBrand?: string | null
  initialStores?: string[]
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore?: (raw: string) => string
  onAdd: (item: {
    name: string
    brand: string | null
    stores: string[]
  }) => void
  onEdit: (prefill: string) => void
  onClose: () => void
}

function buildPrefill(
  product: BarcodeRead,
  displayBrand: string | null,
): string {
  const parts = [product.name]
  if (displayBrand) parts.push(`#${displayBrand}`)
  return parts.join(' ')
}

export function BarcodeScanSheet({
  product,
  initialBrand,
  initialStores,
  displayStore = (raw) => raw,
  onAdd,
  onEdit,
  onClose,
}: Props) {
  // Merge product.stores and initialStores so sigil-provided stores are
  // always shown. Compare by key: a sigil-typed spelling variant of an OFF
  // store must select the displayed chip, not render a phantom twin.
  const byKey = new Map<string, string>()
  for (const s of [...product.stores, ...(initialStores ?? [])]) {
    if (!byKey.has(storeKey(s))) byKey.set(storeKey(s), displayStore(s))
  }
  const allStores = [...byKey.values()]

  const [selectedStores, setSelectedStores] = useState<Set<string>>(
    () =>
      new Set((initialStores ?? []).map((s) => byKey.get(storeKey(s)) ?? s)),
  )

  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  const displayBrand = initialBrand !== undefined ? initialBrand : product.brand

  function toggleStore(store: string) {
    setSelectedStores((prev) => {
      const next = new Set(prev)
      if (next.has(store)) next.delete(store)
      else next.add(store)
      return next
    })
  }

  return (
    <>
      <div className="bss__overlay" onClick={onClose} />
      <div className="bss" ref={sheetRef}>
        <div className="bss__handle" {...swipe} />
        <div className="bss__header">Producto encontrado</div>

        <div className="bss__product-row">
          <div className="bss__product-info">
            <div className="bss__name">{product.name}</div>
            {(displayBrand || allStores.length > 0) && (
              <div className="bss__tags">
                {displayBrand && (
                  <span className="bss__tag">
                    <Tag size={13} /> {displayBrand}
                  </span>
                )}
                {allStores.length > 0 && (
                  <div className="bss__store-chips" data-testid="store-chips">
                    {allStores.map((s) => (
                      <button
                        key={s}
                        className={`bss__tag bss__tag--store${selectedStores.has(s) ? ' bss__tag--store-selected' : ''}`}
                        onClick={() => toggleStore(s)}
                        aria-pressed={selectedStores.has(s)}
                        aria-label={s}
                      >
                        <span aria-hidden="true">
                          <Store size={13} />
                        </span>{' '}
                        <span>{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="bss__edit"
            onClick={() => onEdit(buildPrefill(product, displayBrand))}
            aria-label="Editar"
          >
            <Pencil size={16} />
          </button>
        </div>

        {product.community_price !== null && (
          <div className="bss__community-price">
            <span className="bss__community-price-text">
              <Globe size={14} /> Precio estimado
            </span>
            <span className="bss__community-price-value">
              ~
              {formatPrice(
                product.community_price,
                product.community_price_per,
              )}
            </span>
            <button
              className="bss__community-price-info"
              title={COMMUNITY_PRICE_TOOLTIP}
              aria-label="Información sobre el precio de la comunidad"
            >
              ⓘ
            </button>
          </div>
        )}

        <div className="bss__actions">
          <button className="bss__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="bss__add"
            onClick={() =>
              onAdd({
                name: product.name,
                brand: displayBrand,
                stores: allStores.filter((s) => selectedStores.has(s)),
              })
            }
          >
            Añadir a la lista
          </button>
        </div>
      </div>
    </>
  )
}
