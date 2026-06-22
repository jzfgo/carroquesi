import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceiptScanResult } from "../types";
import ReceiptScanSheet from "./ReceiptScanSheet";

const mockResult: ReceiptScanResult = {
  scan_id: "scan-1",
  store: "Mercadona",
  receipt_date: "2026-04-11",
  receipt_total: 6.45,
  matched: [
    {
      receipt_name: "BEBIDA ALMENDRAS 0%",
      item_id: "item-1",
      item_name: "Bebida de almendra 0% azúcares",
      price_type: "UNIT",
      unit_price: 1.15,
      quantity: null,
      line_total: 1.15,
    },
    {
      receipt_name: "BACON LONCHAS",
      item_id: "item-2",
      item_name: "Bacon lonchas",
      price_type: "KILOGRAM",
      unit_price: 11.40,
      quantity: 0.202,
      line_total: 2.30,
    },
    {
      receipt_name: "YOGUR NATURAL",
      item_id: "item-3",
      item_name: "Yogur natural",
      price_type: "MULTI",
      unit_price: 0.95,
      quantity: 3,
      line_total: 2.85,
    },
  ],
  unmatched: [
    {
      receipt_name: "MANI DULCE",
      price_type: "UNIT",
      unit_price: 3.15,
      quantity: null,
      line_total: 3.15,
    },
  ],
};

const mockPurchasedItems = [
  { id: "item-1", name: "Bebida de almendra 0% azúcares", purchased_at: "2026-04-11T15:00:00", brand: null, stores: ["Mercadona"], quantity: null },
  { id: "item-2", name: "Bacon lonchas", purchased_at: "2026-04-11T15:00:00", brand: null, stores: ["Mercadona"], quantity: null },
  { id: "item-3", name: "Yogur natural", purchased_at: "2026-04-11T15:00:00", brand: null, stores: [], quantity: null },
  { id: "item-4", name: "Maní dulce", purchased_at: "2026-04-10T12:00:00", brand: null, stores: [], quantity: null },
];

function renderSheet(overrides: Partial<ReceiptScanResult> = {}) {
  const result = { ...mockResult, ...overrides };
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ReceiptScanSheet
      result={result}
      purchasedItems={mockPurchasedItems}
      store="Mercadona"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
  return { onConfirm, onClose };
}

describe("ReceiptScanSheet", () => {
  it("shows store name and receipt total", () => {
    renderSheet();
    expect(screen.getByText("Mercadona")).toBeInTheDocument();
    expect(screen.getAllByText(/6[.,]45/).length).toBeGreaterThan(0);
  });

  it("renders OCR names for all lines", () => {
    renderSheet();
    expect(screen.getByText("BEBIDA ALMENDRAS 0%")).toBeInTheDocument();
    expect(screen.getByText("BACON LONCHAS")).toBeInTheDocument();
    expect(screen.getByText("YOGUR NATURAL")).toBeInTheDocument();
    expect(screen.getByText("MANI DULCE")).toBeInTheDocument();
  });

  it("matched items start checked, unmatched start unchecked", () => {
    renderSheet();
    const checkboxes = screen.getAllByRole("checkbox");
    // 3 matched + 1 unmatched = 4 rows
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
    expect(checkboxes[3]).not.toBeChecked();
  });

  it("toolbar shows correct count", () => {
    renderSheet();
    expect(screen.getByText("3 de 4 seleccionados")).toBeInTheDocument();
  });

  it("toggle-all selects all when not all checked", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Seleccionar todo"));
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
    expect(screen.getByText("4 de 4 seleccionados")).toBeInTheDocument();
  });

  it("toggle-all deselects all when all are checked", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Seleccionar todo")); // select all
    fireEvent.click(screen.getByText("Deseleccionar todo")); // deselect all
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("shows quantity × price summary for KILOGRAM items", () => {
    renderSheet();
    // 0.202 kg → 202g; 11.40 €/kg
    expect(screen.getByText(/202g/)).toBeInTheDocument();
    expect(screen.getByText(/11[.,]40.*€\/kg/)).toBeInTheDocument();
  });

  it("shows quantity × price summary for MULTI items", () => {
    renderSheet();
    // YOGUR NATURAL: 3× 0,95 €/ud (tighter regex to avoid matching "1× 3,15 €/ud")
    expect(screen.getByText(/3× 0[.,]95.*€\/ud/)).toBeInTheDocument();
  });

  it("shows 'sin vincular' for unmatched items", () => {
    renderSheet();
    expect(screen.getByText("sin vincular")).toBeInTheDocument();
  });

  it("unchecking a matched item updates toolbar count", () => {
    renderSheet();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText("2 de 4 seleccionados")).toBeInTheDocument();
  });

  it("two lines with the same receipt_name have independent checkboxes", () => {
    const result: ReceiptScanResult = {
      ...mockResult,
      matched: [
        { ...mockResult.matched[0], receipt_name: "LECHE", item_id: "item-1" },
        { ...mockResult.matched[1], receipt_name: "LECHE", item_id: "item-2" },
      ],
      unmatched: [],
    };
    render(
      <ReceiptScanSheet
        result={result}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // uncheck first
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked(); // second unaffected
  });

  it("onConfirm called with patches including quantity", () => {
    const { onConfirm } = renderSheet();
    fireEvent.click(screen.getByText(/Guardar precios/));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [patches] = onConfirm.mock.calls[0];
    expect(patches).toHaveLength(3); // 3 matched, 0 unmatched linked

    const unit = patches.find((p: { item_id: string }) => p.item_id === "item-1");
    expect(unit.price).toBe(1.15);
    expect(unit.price_per).toBeNull();
    expect(unit.quantity).toBe("1");

    const kg = patches.find((p: { item_id: string }) => p.item_id === "item-2");
    expect(kg.price).toBeCloseTo(11.40);
    expect(kg.price_per).toBe("KILOGRAM");
    expect(kg.quantity).toBe("202g");

    const multi = patches.find((p: { item_id: string }) => p.item_id === "item-3");
    expect(multi.price).toBeCloseTo(0.95);
    expect(multi.price_per).toBeNull();
    expect(multi.quantity).toBe("3");
  });

  it("footer shows selected total and receipt total", () => {
    renderSheet();
    // selected: 1.15 + 2.302 + 2.85 = 6.302 ≈ 6.30; receipt: 6.45
    expect(screen.getByText(/Seleccionado/)).toBeInTheDocument();
    // "Ticket €6.45" in footer (distinct from "Ticket escaneado" in header)
    expect(screen.getByText(/Ticket €/)).toBeInTheDocument();
  });

  it("footer shows coincide when totals match within 2 cents", () => {
    // receipt_total matches sum of matched items exactly
    const result: ReceiptScanResult = {
      ...mockResult,
      receipt_total: 1.15,
      matched: [mockResult.matched[0]],
      unmatched: [],
    };
    render(
      <ReceiptScanSheet
        result={result}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/coincide/)).toBeInTheDocument();
  });
});
