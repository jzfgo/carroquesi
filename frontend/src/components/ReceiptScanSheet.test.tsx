import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReceiptScanSheet from "./ReceiptScanSheet";
import type { ReceiptScanResult } from "../types/receipt";

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
  { id: "item-1", name: "Bebida de almendra 0% azúcares" },
  { id: "item-2", name: "Bacon lonchas" },
  { id: "item-3", name: "Yogur natural" },
  { id: "item-4", name: "Maní dulce" },
];

describe("ReceiptScanSheet", () => {
  it("shows store name and total", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Mercadona")).toBeInTheDocument();
    expect(screen.getByText(/6[.,]45/)).toBeInTheDocument();
  });

  it("renders matched items pre-checked", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Bebida de almendra 0% azúcares")).toBeInTheDocument();
    expect(screen.getByText("BEBIDA ALMENDRAS 0%")).toBeInTheDocument();
  });

  it("shows /kg suffix for KILOGRAM items", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("/kg")).toBeInTheDocument();
  });

  it("shows weight context for KILOGRAM items", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/0[.,]202\s*kg/)).toBeInTheDocument();
  });

  it("shows count context for MULTI items", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/3\s*×/)).toBeInTheDocument();
  });

  it("renders unmatched items with link dropdown", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("MANI DULCE")).toBeInTheDocument();
    expect(screen.getByText("Vincular a elemento…")).toBeInTheDocument();
  });

  it("confirm button shows matched count", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/3 elementos/)).toBeInTheDocument();
  });

  it("unchecking a matched item decrements the count", () => {
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText(/2 elementos/)).toBeInTheDocument();
  });

  it("calls onConfirm with unit_price as price and KILOGRAM price_per", () => {
    const onConfirm = vi.fn();
    render(
      <ReceiptScanSheet
        result={mockResult}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/Guardar precios/));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [patches] = onConfirm.mock.calls[0];
    expect(patches).toHaveLength(3);

    const unit = patches.find((p: { item_id: string }) => p.item_id === "item-1");
    expect(unit.price).toBe(1.15);
    expect(unit.price_per).toBeNull();

    const kg = patches.find((p: { item_id: string }) => p.item_id === "item-2");
    expect(kg.price).toBeCloseTo(11.40);
    expect(kg.price_per).toBe("KILOGRAM");

    const multi = patches.find((p: { item_id: string }) => p.item_id === "item-3");
    expect(multi.price).toBeCloseTo(0.95);
    expect(multi.price_per).toBeNull();
  });
});
