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
      price: 1.15,
      price_per: null,
    },
    {
      receipt_name: "BACON LONCHAS",
      item_id: "item-2",
      item_name: "Bacon lonchas",
      price: 2.30,
      price_per: "KILOGRAM",
    },
  ],
  unmatched: [
    { receipt_name: "MANI DULCE", price: 3.15, price_per: null },
  ],
};

const mockPurchasedItems = [
  { id: "item-1", name: "Bebida de almendra 0% azúcares" },
  { id: "item-2", name: "Bacon lonchas" },
  { id: "item-3", name: "Maní dulce" },
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

  it("shows /kg suffix for weight items", () => {
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
    expect(screen.getByText(/2 elementos/)).toBeInTheDocument();
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
    expect(screen.getByText(/1 elemento/)).toBeInTheDocument();
  });

  it("calls onConfirm with patches and mappings", () => {
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
    expect(patches).toHaveLength(2);
    expect(patches[0].item_id).toBe("item-1");
    expect(patches[0].price).toBe(1.15);
  });
});
