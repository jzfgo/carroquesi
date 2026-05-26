import { useState } from "react";
import type { ReceiptScanResult, PricePatch, NameMapping } from "../types/receipt";
import { formatPrice } from "../lib/formatPrice";

interface PurchasedItemRef {
  id: string;
  name: string;
}

interface Props {
  result: ReceiptScanResult;
  purchasedItems: PurchasedItemRef[];
  store: string | null;
  onConfirm: (patches: PricePatch[], mappings: NameMapping[]) => void;
  onClose: () => void;
}

export default function ReceiptScanSheet({ result, purchasedItems, store, onConfirm, onClose }: Props) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(result.matched.map((m) => m.item_id))
  );
  const [linkedItems, setLinkedItems] = useState<Record<string, string>>({});

  const toggleItem = (itemId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) { next.delete(itemId); } else { next.add(itemId); }
      return next;
    });
  };

  const confirmedMatched = result.matched.filter((m) => checkedIds.has(m.item_id));
  const confirmedLinked = Object.entries(linkedItems)
    .filter(([, itemId]) => itemId !== "")
    .map(([receiptName, itemId]) => {
      const unmatched = result.unmatched.find((u) => u.receipt_name === receiptName)!;
      const item = purchasedItems.find((i) => i.id === itemId)!;
      return { unmatched, item };
    });

  const totalCount = confirmedMatched.length + confirmedLinked.length;

  const handleConfirm = () => {
    const patches: PricePatch[] = [
      ...confirmedMatched.map((m) => ({
        item_id: m.item_id,
        price: m.price,
        price_per: m.price_per,
        store: store,
      })),
      ...confirmedLinked.map(({ unmatched, item }) => ({
        item_id: item.id,
        price: unmatched.price,
        price_per: unmatched.price_per,
        store: store,
      })),
    ];

    const mappings: NameMapping[] = [
      ...confirmedMatched.map((m) => ({
        store: store ?? "",
        receipt_name: m.receipt_name.toLowerCase(),
        item_name: m.item_name,
        item_brand: null,
      })),
      ...confirmedLinked.map(({ unmatched, item }) => ({
        store: store ?? "",
        receipt_name: unmatched.receipt_name.toLowerCase(),
        item_name: item.name,
        item_brand: null,
      })),
    ].filter((m) => m.store !== "");

    onConfirm(patches, mappings);
  };

  const alreadyLinkedItemIds = new Set([
    ...confirmedMatched.map((m) => m.item_id),
    ...Object.values(linkedItems).filter(Boolean),
  ]);

  const availableItems = (receiptName: string) =>
    purchasedItems.filter(
      (i) => !alreadyLinkedItemIds.has(i.id) || linkedItems[receiptName] === i.id
    );

  const formattedDate = result.receipt_date
    ? new Date(result.receipt_date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="sheet">
      <div className="sheet-handle" />

      <div className="sheet-header">
        <div className="sheet-title-row">
          <div className="sheet-title">
            Ticket escaneado
            {store && <span className="store-badge">{store}</span>}
          </div>
          <button className="sheet-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="sheet-meta">
          {formattedDate && <span>📅 {formattedDate}</span>}
          {result.receipt_total != null && (
            <span>💶 {formatPrice(result.receipt_total)}</span>
          )}
        </div>
      </div>

      <div className="sheet-body">
        {result.matched.length > 0 && (
          <>
            <div className="section-label">
              Encontrados <span style={{ color: "var(--color-success)" }}>{result.matched.length}</span>
            </div>
            {result.matched.map((m) => (
              <div key={m.item_id} className="receipt-item">
                <input
                  type="checkbox"
                  checked={checkedIds.has(m.item_id)}
                  onChange={() => toggleItem(m.item_id)}
                  className="item-check"
                />
                <div className="item-body">
                  <div className="item-receipt-name">{m.receipt_name}</div>
                  <div className="item-matched-name">{m.item_name}</div>
                </div>
                <div className="item-price-col">
                  <div className="item-price">{formatPrice(m.price)}</div>
                  {m.price_per === "KILOGRAM" && <div className="item-price-per">/kg</div>}
                </div>
              </div>
            ))}
          </>
        )}

        {result.unmatched.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 16, color: "var(--color-warning)" }}>
              Sin vincular <span style={{ fontWeight: 700 }}>{result.unmatched.length}</span>
            </div>
            {result.unmatched.map((u) => (
              <div key={u.receipt_name} className="unmatched-item">
                <div className="unmatched-row">
                  <div className="unmatched-name">{u.receipt_name}</div>
                  <div className="unmatched-price">{formatPrice(u.price)}</div>
                </div>
                <div className="link-row">
                  <select
                    className="link-select"
                    value={linkedItems[u.receipt_name] ?? ""}
                    onChange={(e) =>
                      setLinkedItems((prev) => ({ ...prev, [u.receipt_name]: e.target.value }))
                    }
                  >
                    <option value="" disabled>Vincular a elemento…</option>
                    {availableItems(u.receipt_name).map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  <button
                    className="skip-btn"
                    onClick={() => setLinkedItems((prev) => ({ ...prev, [u.receipt_name]: "" }))}
                  >
                    Omitir
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="sheet-footer">
        <button
          className="confirm-btn"
          disabled={totalCount === 0}
          onClick={handleConfirm}
        >
          Guardar precios
          <span className="confirm-count">
            {totalCount} {totalCount === 1 ? "elemento" : "elementos"}
          </span>
        </button>
      </div>
    </div>
  );
}
