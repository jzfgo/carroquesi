import { useState } from "react";
import type { MatchedLine, PricePatch, NameMapping, UnmatchedLine, ReceiptScanResult } from "../types/receipt";
import { formatPrice } from "../lib/formatPrice";
import "./ReceiptScanSheet.css";

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

function PriceContext({ line }: { line: MatchedLine | UnmatchedLine }) {
  if (line.price_type === "KILOGRAM" && line.quantity != null) {
    return (
      <div className="item-price-context">
        {line.quantity.toLocaleString("es-ES", { maximumFractionDigits: 3 })} kg × {formatPrice(line.unit_price)}/kg
      </div>
    );
  }
  if (line.price_type === "MULTI" && line.quantity != null) {
    return (
      <div className="item-price-context">
        {line.quantity}× {formatPrice(line.unit_price)}
      </div>
    );
  }
  return null;
}

function pricePatchFor(line: MatchedLine | UnmatchedLine, itemId: string, store: string | null): PricePatch {
  return {
    item_id: itemId,
    price: line.unit_price,
    price_per: line.price_type === "KILOGRAM" ? "KILOGRAM" : null,
    store,
  };
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
      ...confirmedMatched.map((m) => pricePatchFor(m, m.item_id, store)),
      ...confirmedLinked.map(({ unmatched, item }) => pricePatchFor(unmatched, item.id, store)),
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
                  <div className="item-price">{formatPrice(m.line_total)}</div>
                  {m.price_type === "KILOGRAM" && <div className="item-price-per">/kg</div>}
                  <PriceContext line={m} />
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
                  <div className="unmatched-price">
                    {formatPrice(u.line_total)}
                    <PriceContext line={u} />
                  </div>
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
