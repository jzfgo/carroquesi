import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useListItems } from "../hooks/useListItems";
import { useOwnBrandInference } from "../hooks/useOwnBrandInference";
import {
  ApiError,
  getBarcode,
  getDueSuggestions,
  getSuggestions,
  uploadReceipt,
  submitReceiptPrices,
} from "../lib/api";
import type { ReceiptScanResult, PricePatch, NameMapping } from "../types/receipt";
import ReceiptScanSheet from "./ReceiptScanSheet";
import { computeCostSummary, purchasedDateLabel } from "../lib/itemCost";
import { getLastPriceStore, setLastPriceStore } from "../lib/lastPriceStore";
import { parseInput } from "../parseInput";
import type {
  BarcodeRead,
  DueSuggestion,
  EditingTag,
  TagField,
} from "../types";
import { BarcodeScanner } from "./BarcodeScanner";
import { BarcodeScanSheet } from "./BarcodeScanSheet";
import { FrequencySuggestionBanner } from "./FrequencySuggestionBanner";
import { ItemActionSheet } from "./ItemActionSheet";
import { ItemList } from "./ItemList";
import { ListHeader } from "./ListHeader";
import { ListMembersSheet } from "./ListMembersSheet";
import "./ListScreen.css";
import LogPriceSheet from "./LogPriceSheet";
import PriceHistorySheet from "./PriceHistorySheet";
import { ProgressBar } from "./ProgressBar";
import PurchaseToast from "./PurchaseToast";
import { SmartInputBar } from "./SmartInputBar";
import { StoreEditSheet } from "./StoreEditSheet";
import { FilterBar } from "./FilterBar";
import { filterItems } from "../hooks/useItemFilter";
import { TagEditSheet } from "./TagEditSheet";
import { Toast } from "./Toast";

interface Props {
  listId: string;
  listName: string;
  listEmoji?: string | null;
  listOwnerId: string;
  autoOpenReceiptScan?: boolean;
  onBack?: () => void;
}

type EanLookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; product: BarcodeRead }
  | { status: "error"; message: string };

export function ListScreen({
  listId,
  listName,
  listEmoji = null,
  listOwnerId,
  autoOpenReceiptScan = false,
  onBack,
}: Props) {
  const { getToken, user } = useAuth();
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterMode, setFilterMode] = useState<'chips' | 'search'>('chips');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<BarcodeRead | null>(
    null,
  );
  const [dueSuggestions, setDueSuggestions] = useState<DueSuggestion[]>([]);
  const [priceItemId, setPriceItemId] = useState<string | null>(null);
  const [logPriceFor, setLogPriceFor] = useState<{
    itemId: string;
    initialAmount: number | null;
    initialPricePer: "KILOGRAM" | null;
    initialStore: string | null;
    suggestedStore: string | null;
  } | null>(null);
  const [purchaseToast, setPurchaseToast] = useState<{
    itemId: string;
    itemName: string;
  } | null>(null);
  const handleDismissPurchaseToast = useCallback(
    () => setPurchaseToast(null),
    [],
  );

  const [eanLookup, setEanLookup] = useState<EanLookupState>({
    status: "idle",
  });
  const eanRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoOpenFiredRef = useRef(false);
  const [receiptScanResult, setReceiptScanResult] = useState<ReceiptScanResult | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const currentUserId = user!.id;
  const isOwner = listOwnerId === currentUserId;

  const parsed = useMemo(() => parseInput(inputValue), [inputValue]);
  const { visibleChip, storeToAdd, dismiss: dismissInferredStore } = useOwnBrandInference(
    parsed.brand,
    parsed.stores,
  );
  const {
    status,
    items,
    members,
    togglePurchased,
    addItem,
    updateTag,
    updateStores,
    renameItem,
    removeItem,
    savePrice,
    clearItemPrice,
    retry,
  } = useListItems(listId, getToken, setToast);

  // Debounced suggestions — only when name has 2+ chars
  useEffect(() => {
    const q = parsed.name.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await getSuggestions(getToken, q);
        setSuggestions(data.map((s) => s.name));
      } catch {
        // suggestion errors are non-critical
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [parsed.name, getToken]);

  useEffect(() => {
    void getDueSuggestions(getToken, listId)
      .then(setDueSuggestions)
      .catch(() => {
        /* non-critical */
      });
  }, [listId, getToken]);

  useEffect(() => {
    if (autoOpenReceiptScan && !autoOpenFiredRef.current) {
      autoOpenFiredRef.current = true;
      fileInputRef.current?.click();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReceiptScan = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        setToast("La imagen es demasiado grande (máx. 10 MB)");
        return;
      }
      setReceiptUploading(true);
      try {
        const result = await uploadReceipt(getToken, listId, file);
        setReceiptScanResult(result);
      } catch {
        setToast("No se pudo leer el ticket");
      } finally {
        setReceiptUploading(false);
      }
    },
    [getToken, listId],
  );

  const handleReceiptConfirm = useCallback(
    async (patches: PricePatch[], mappings: NameMapping[]) => {
      if (!receiptScanResult) return;
      try {
        const data = await submitReceiptPrices(getToken, listId, {
          scan_id: receiptScanResult.scan_id,
          patches,
          mappings,
        });
        setReceiptScanResult(null);
        const n = data.items_updated;
        setToast(`${n} precio${n !== 1 ? "s" : ""} actualizado${n !== 1 ? "s" : ""}`);
      } catch {
        setToast("No se pudieron guardar los precios");
      }
    },
    [getToken, listId, receiptScanResult],
  );

  const handleTogglePurchased = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      void togglePurchased(itemId);
      // Show toast when marking as purchased (not when unmarking)
      if (item && !item.purchased) {
        setPurchaseToast({ itemId, itemName: item.name });
      }
    },
    [togglePurchased, items],
  );

  const handleTagClick = useCallback(
    (itemId: string, field: TagField | "stores") => {
      setEditingTag({ itemId, field });
    },
    [],
  );

  const handleItemMenuOpen = useCallback((itemId: string) => {
    setActiveItemId(itemId);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setMenuOpen(prev => !prev);
  }, []);

  const handleChange = useCallback((value: string) => {
    eanRequestIdRef.current++;
    setEanLookup({ status: "idle" });
    setInputValue(value);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return;
    const stores = storeToAdd
      ? [...new Set([...parsed.stores, storeToAdd])]
      : parsed.stores;
    void addItem({ ...parsed, stores });
    setInputValue("");
  }, [parsed, addItem, storeToAdd]);

  const handleScanRequest = useCallback(() => {
    setScannerOpen(true);
  }, []);

  const handleScanResult = useCallback((product: BarcodeRead) => {
    setScannerOpen(false);
    setScannedProduct(product);
  }, []);

  const handleScanError = useCallback((message: string) => {
    setScannerOpen(false);
    setToast(message);
  }, []);

  const handleScanAdd = useCallback(
    (item: { name: string; brand: string | null; stores: string[] }) => {
      const ean = scannedProduct?.ean ?? null;
      setScannedProduct(null);
      void addItem({
        name: item.name,
        brand: item.brand,
        stores: item.stores,
        quantity: null,
        ean,
      });
    },
    [addItem, scannedProduct],
  );

  const handleOpenLogPrice = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      setLogPriceFor({
        itemId,
        initialAmount: item?.price ?? null,
        initialPricePer: (item?.price_per as "KILOGRAM" | null) ?? null,
        initialStore: item?.price_store ?? item?.stores?.[0] ?? null,
        suggestedStore: item?.stores?.length ? null : getLastPriceStore(),
      });
    },
    [items],
  );

  const handleSavePrice = useCallback(
    async (
      amount: number,
      pricePer: "KILOGRAM" | null,
      store: string | null,
    ) => {
      if (!logPriceFor) return;
      try {
        await savePrice(logPriceFor.itemId, amount, pricePer, store);
        if (store) setLastPriceStore(store);
      } catch {
        // non-critical
      }
      setLogPriceFor(null);
      setPriceItemId(null);
      setPurchaseToast(null);
    },
    [logPriceFor, savePrice],
  );

  const handleDeletePrice = useCallback(async () => {
    if (!logPriceFor) return;
    try {
      await clearItemPrice(logPriceFor.itemId);
      setLogPriceFor(null);
      setPriceItemId(null);
      setPurchaseToast(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // price already gone — treat as success, close sheet
        setLogPriceFor(null);
        setPriceItemId(null);
        setPurchaseToast(null);
      } else if (err instanceof ApiError && err.status === 409) {
        setToast('No se puede eliminar el precio de un artículo comprado en otro día');
        throw err;
      } else {
        setToast('No se pudo eliminar el precio');
        throw err;
      }
    }
  }, [logPriceFor, clearItemPrice]);

  const handleScanEdit = useCallback((prefill: string) => {
    setScannedProduct(null);
    setInputValue(prefill);
  }, []);

  const handleEanSearch = useCallback(
    async (ean: string) => {
      const requestId = ++eanRequestIdRef.current;
      setEanLookup({ status: "loading" });
      try {
        const product = await getBarcode(getToken, ean);
        if (requestId !== eanRequestIdRef.current) return;
        setEanLookup({ status: "found", product });
      } catch (err) {
        if (requestId !== eanRequestIdRef.current) return;
        if (err instanceof ApiError && err.status === 404) {
          setEanLookup({ status: "error", message: "Código no encontrado" });
        } else {
          setEanLookup({ status: "error", message: "Error de conexión" });
        }
      }
    },
    [getToken],
  );

  const handleClear = useCallback(() => {
    eanRequestIdRef.current++;
    setEanLookup({ status: "idle" });
    setInputValue("");
  }, []);

  const handleEanAdd = useCallback(
    (item: { name: string; brand: string | null; stores: string[] }) => {
      const ean = eanLookup.status === "found" ? eanLookup.product.ean : null;
      setEanLookup({ status: "idle" });
      setInputValue("");
      void addItem({
        name: item.name,
        brand: item.brand,
        stores: item.stores,
        quantity: null,
        ean,
      });
    },
    [addItem, eanLookup],
  );

  const handleEanEdit = useCallback((prefill: string) => {
    setEanLookup({ status: "idle" });
    setInputValue(prefill);
  }, []);

  const handleSuggestionAdd = useCallback(
    (s: DueSuggestion) => {
      void addItem({
        name: s.name,
        brand: s.brand,
        stores: s.stores,
        quantity: null,
      });
      setDueSuggestions((prev) => prev.filter((x) => x.name !== s.name));
    },
    [addItem],
  );

  const { purchasedCount, totalCount } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
    const isPurchasedToday = (i: (typeof items)[number]) =>
      !!i.purchased_at && i.purchased_at.slice(0, 10) === today;
    let purchased = 0;
    let total = 0;
    for (const i of items) {
      if (!i.purchased) {
        total++;
      } else if (isPurchasedToday(i)) {
        purchased++;
        total++;
      }
    }
    return { purchasedCount: purchased, totalCount: total };
  }, [items]);

  const stores = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items.filter((i) => !i.purchased)) {
      for (const s of item.stores) {
        if (!seen.has(s)) {
          seen.add(s);
          result.push(s);
        }
      }
    }
    return result.sort();
  }, [items]);

  const filteredItems = useMemo(
    () => filterItems(items, filterQuery, { strictStore: filterMode === 'search' }),
    [items, filterQuery, filterMode],
  );
  const allUnpurchasedCount = useMemo(
    () => items.filter(i => !i.purchased).length,
    [items],
  );

  const { pendingCost, purchasedCostByDate } = useMemo(() => {
    const pendingItems: typeof filteredItems = [];
    const byDate = new Map<string, typeof filteredItems>();
    for (const item of filteredItems) {
      if (!item.purchased) {
        pendingItems.push(item);
      } else {
        const label = purchasedDateLabel(item.purchased_at);
        const group = byDate.get(label) ?? [];
        group.push(item);
        byDate.set(label, group);
      }
    }
    const costByDate = new Map<string, ReturnType<typeof computeCostSummary>>();
    for (const [label, group] of byDate) {
      costByDate.set(label, computeCostSummary(group));
    }
    return { pendingCost: computeCostSummary(pendingItems), purchasedCostByDate: costByDate };
  }, [filteredItems]);

  return (
    <div className="list-screen">
      <ListHeader
        title={listName}
        emoji={listEmoji}
        onMenuOpen={handleMenuToggle}
        onBack={onBack}
      />
      <ProgressBar purchased={purchasedCount} total={totalCount} />
      {items.length > 0 && (
        <FilterBar
          stores={stores}
          query={filterQuery}
          onChange={setFilterQuery}
          onModeChange={setFilterMode}
        />
      )}
      <ItemList
        status={status}
        items={filteredItems}
        totalItems={allUnpurchasedCount}
        members={members}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onMenuOpen={handleItemMenuOpen}
        onRetry={retry}
        onPriceClick={(itemId) => setPriceItemId(itemId)}
        pendingCost={pendingCost}
        purchasedCostByDate={purchasedCostByDate}
      />
      {editingTag &&
        (() => {
          const editedItem = items.find((i) => i.id === editingTag.itemId);
          if (!editedItem) return null;
          if (editingTag.field === "stores") {
            return (
              <StoreEditSheet
                key={editingTag.itemId}
                item={editedItem}
                items={items}
                onSave={(stores: string[]) => {
                  void updateStores(editingTag.itemId, stores);
                  setEditingTag(null);
                }}
                onClose={() => setEditingTag(null)}
              />
            );
          }
          return (
            <TagEditSheet
              key={`${editingTag.itemId}-${editingTag.field}`}
              item={editedItem}
              field={editingTag.field}
              items={items}
              onSave={(value) => {
                void updateTag(
                  editingTag.itemId,
                  editingTag.field as TagField,
                  value,
                );
                setEditingTag(null);
              }}
              onClose={() => setEditingTag(null)}
            />
          );
        })()}
      {activeItemId &&
        (() => {
          const activeItem = items.find((i) => i.id === activeItemId);
          if (!activeItem) return null;
          return (
            <ItemActionSheet
              item={activeItem}
              purchased={activeItem.purchased}
              onRename={(name) => {
                void renameItem(activeItemId, name);
                setActiveItemId(null);
              }}
              onDelete={() => {
                void removeItem(activeItemId);
                setActiveItemId(null);
              }}
              onClose={() => setActiveItemId(null)}
            />
          );
        })()}
      {menuOpen && (
        <ListMembersSheet
          listId={listId}
          currentUserId={currentUserId}
          isOwner={isOwner}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {!editingTag && !menuOpen && !activeItemId && (
        <>
          {allUnpurchasedCount === 0 && items.length > 0 && !receiptScanResult && (
            <div className="receipt-scan-cta">
              <button
                className="receipt-scan-cta__btn"
                onClick={handleReceiptScan}
                disabled={receiptUploading}
              >
                {receiptUploading ? "Procesando ticket…" : "🧾 Escanear ticket para registrar precios"}
              </button>
            </div>
          )}
          <FrequencySuggestionBanner
            suggestions={dueSuggestions}
            onAdd={handleSuggestionAdd}
          />
          <SmartInputBar
            value={inputValue}
            parsed={parsed}
            items={items}
            suggestions={suggestions}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onClear={handleClear}
            onScanRequest={handleScanRequest}
            onEanSearch={handleEanSearch}
            eanLoading={eanLookup.status === "loading"}
            eanError={eanLookup.status === "error" ? eanLookup.message : null}
            inferredStoreChip={visibleChip}
            onDismissInferredStore={dismissInferredStore}
          />
        </>
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {scannerOpen && (
        <BarcodeScanner
          getToken={getToken}
          onResult={handleScanResult}
          onError={handleScanError}
          onClose={() => setScannerOpen(false)}
        />
      )}
      {scannedProduct && (
        <BarcodeScanSheet
          product={scannedProduct}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onAdd={handleScanAdd as any}
          onEdit={handleScanEdit}
          onClose={() => setScannedProduct(null)}
        />
      )}
      {eanLookup.status === "found" && (
        <BarcodeScanSheet
          product={eanLookup.product}
          initialBrand={parsed.brand ?? undefined}
          initialStores={parsed.stores}
          onAdd={handleEanAdd}
          onEdit={handleEanEdit}
          onClose={handleClear}
        />
      )}

      {priceItemId &&
        (() => {
          const priceItem = items.find((i) => i.id === priceItemId);
          if (!priceItem) return null;
          return (
            <>
              <div
                className="sheet-overlay"
                onClick={() => setPriceItemId(null)}
              />
              <div className="sheet-container">
                <PriceHistorySheet
                  item={priceItem}
                  listId={listId}
                  getToken={getToken}
                  onLogPrice={() => handleOpenLogPrice(priceItemId)}
                  onClose={() => setPriceItemId(null)}
                  readOnly={priceItem.purchased}
                />
              </div>
            </>
          );
        })()}

      {logPriceFor &&
        (() => {
          const logItem = items.find((i) => i.id === logPriceFor.itemId);
          if (!logItem) return null;
          return (
            <>
              <div
                className="sheet-overlay"
                onClick={() => setLogPriceFor(null)}
              />
              <div className="sheet-container">
                <LogPriceSheet
                  item={logItem}
                  initialAmount={logPriceFor.initialAmount}
                  initialPricePer={logPriceFor.initialPricePer}
                  initialStore={logPriceFor.initialStore}
                  suggestedStore={logPriceFor.suggestedStore}
                  onSave={handleSavePrice}
                  onDelete={handleDeletePrice}
                  onClose={() => setLogPriceFor(null)}
                />
              </div>
            </>
          );
        })()}

      {purchaseToast && (
        <PurchaseToast
          itemName={purchaseToast.itemName}
          onDismiss={handleDismissPurchaseToast}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {receiptUploading && (
        <>
          <div className="sheet-overlay" />
          <div className="receipt-uploading-indicator">
            <span className="receipt-uploading-indicator__spinner" role="status" aria-label="Procesando ticket" />
            <span>Procesando ticket…</span>
          </div>
        </>
      )}

      {receiptScanResult && (
        <>
          <div className="sheet-overlay" onClick={() => setReceiptScanResult(null)} />
          <div className="sheet-container">
            <ReceiptScanSheet
              result={receiptScanResult}
              purchasedItems={items
                .filter((i) => i.purchased)
                .map((i) => ({ id: i.id, name: i.name }))}
              store={receiptScanResult.store}
              onConfirm={handleReceiptConfirm}
              onClose={() => setReceiptScanResult(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
