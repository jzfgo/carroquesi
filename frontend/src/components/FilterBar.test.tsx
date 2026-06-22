import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { FilterBar } from "./FilterBar";

describe("FilterBar", () => {
  test("renders only the search button when stores is empty", () => {
    render(<FilterBar stores={[]} query="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /buscar/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Todas" }),
    ).not.toBeInTheDocument();
  });

  test("renders search button and chips in chip mode", () => {
    render(
      <FilterBar stores={["Mercadona", "Lidl"]} query="" onChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /buscar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mercadona" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lidl" })).toBeInTheDocument();
  });

  test('"Todas" chip is active (aria-pressed=true) when query is empty', () => {
    render(<FilterBar stores={["Mercadona"]} query="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Mercadona" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test('store chip is active when query is "@StoreName"', () => {
    render(
      <FilterBar
        stores={["Mercadona", "Lidl"]}
        query="@Mercadona"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Mercadona" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Lidl" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test('clicking a store chip calls onChange with "@StoreName"', () => {
    const onChange = vi.fn();
    render(<FilterBar stores={["Mercadona"]} query="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Mercadona" }));
    expect(onChange).toHaveBeenCalledWith("@Mercadona");
  });

  test('clicking "Todas" chip calls onChange with ""', () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        stores={["Mercadona"]}
        query="@Mercadona"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  test("clicking the search button reveals the text input", () => {
    render(<FilterBar stores={["Mercadona"]} query="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  test("typing in the search input calls onChange with the typed value", () => {
    const onChange = vi.fn();
    render(<FilterBar stores={["Mercadona"]} query="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "@Mercadona leche" },
    });
    expect(onChange).toHaveBeenCalledWith("@Mercadona leche");
  });

  test('clicking the close button exits search mode and calls onChange("")', () => {
    const onChange = vi.fn();
    render(<FilterBar stores={["Mercadona"]} query="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
