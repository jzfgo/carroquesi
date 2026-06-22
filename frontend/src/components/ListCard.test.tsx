import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiList } from "../types";
import { ListCard } from "./ListCard";

const makeList = (overrides: Partial<ApiList> = {}): ApiList => ({
  id: "l1",
  name: "Mercado semanal",
  emoji: null,
  owner_id: "u1",
  created_at: "",
  updated_at: "",
  item_count: 8,
  purchased_count: 3,
  ...overrides,
});

describe("ListCard", () => {
  it("shows the list name", () => {
    render(
      <ListCard
        list={makeList()}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Mercado semanal")).toBeInTheDocument();
  });

  it('shows "X de Y comprados" subtitle when items exist', () => {
    render(
      <ListCard
        list={makeList({ item_count: 8, purchased_count: 3 })}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("3 de 8 comprados")).toBeInTheDocument();
  });

  it("hides subtitle when item_count is 0", () => {
    render(
      <ListCard
        list={makeList({ item_count: 0, purchased_count: 0 })}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />,
    );
    expect(screen.queryByText(/comprados/)).not.toBeInTheDocument();
  });

  it("calls onClick when tap-target is clicked", () => {
    const onClick = vi.fn();
    render(
      <ListCard
        list={makeList()}
        isOwner={false}
        onClick={onClick}
        onMenuOpen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /mercado semanal/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("⋯ button is present", () => {
    render(
      <ListCard
        list={makeList()}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /opciones/i }),
    ).toBeInTheDocument();
  });

  it("tapping ⋯ calls onMenuOpen", () => {
    const onMenuOpen = vi.fn();
    render(
      <ListCard
        list={makeList()}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={onMenuOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /opciones/i }));
    expect(onMenuOpen).toHaveBeenCalledOnce();
  });

  it("tapping ⋯ does not call onClick", () => {
    const onClick = vi.fn();
    render(
      <ListCard
        list={makeList()}
        isOwner={false}
        onClick={onClick}
        onMenuOpen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /opciones/i }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("ListCard — emoji", () => {
  it("renders emoji as a tappable button for the owner", () => {
    render(
      <ListCard
        list={makeList({ emoji: "🛒" })}
        isOwner={true}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
        onEmojiTap={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /cambiar emoji/i }),
    ).toHaveTextContent("🛒");
  });

  it("renders emoji as a non-interactive span for non-owners", () => {
    render(
      <ListCard
        list={makeList({ emoji: "🛒" })}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /cambiar emoji/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("🛒")).toBeInTheDocument();
  });

  it("renders nothing in the emoji slot when emoji is null (non-owner)", () => {
    const { container } = render(
      <ListCard
        list={makeList({ emoji: null })}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />,
    );
    expect(
      container.querySelector(".list-card__emoji"),
    ).not.toBeInTheDocument();
  });

  it("owner with null emoji sees a placeholder add button", () => {
    render(
      <ListCard
        list={makeList({ emoji: null })}
        isOwner={true}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
        onEmojiTap={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /añadir emoji/i }),
    ).toBeInTheDocument();
  });

  it("tapping emoji button calls onEmojiTap", () => {
    const onEmojiTap = vi.fn();
    render(
      <ListCard
        list={makeList({ emoji: "🛒" })}
        isOwner={true}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
        onEmojiTap={onEmojiTap}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cambiar emoji/i }));
    expect(onEmojiTap).toHaveBeenCalledOnce();
  });

  it("tapping emoji button does not trigger the list onClick", () => {
    const onClick = vi.fn();
    render(
      <ListCard
        list={makeList({ emoji: "🛒" })}
        isOwner={true}
        onClick={onClick}
        onMenuOpen={vi.fn()}
        onEmojiTap={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cambiar emoji/i }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
