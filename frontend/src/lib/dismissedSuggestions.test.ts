import { beforeEach, expect, test, vi } from "vitest";
import {
  _resetCacheForTesting,
  isDismissed,
  writeDismissal,
} from "./dismissedSuggestions";

const KEY = "cqs_dismissed_suggestions";

beforeEach(() => {
  localStorage.clear();
  _resetCacheForTesting();
});

test("isDismissed returns false when no entry exists", () => {
  expect(isDismissed("Bananas")).toBe(false);
});

test("isDismissed returns true within TTL", () => {
  writeDismissal("Bananas", 3);
  expect(isDismissed("Bananas")).toBe(true);
});

test("isDismissed returns false after TTL expires", () => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  writeDismissal("Bananas", 3);
  vi.spyOn(Date, "now").mockReturnValue(now + 4 * 86400000);
  expect(isDismissed("Bananas")).toBe(false);
  vi.restoreAllMocks();
});

test("writeDismissal prunes expired entries", () => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  writeDismissal("OldItem", 1);
  vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86400000);
  writeDismissal("NewItem", 3);
  const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
    string,
    string
  >;
  expect(stored["OldItem"]).toBeUndefined();
  expect(stored["NewItem"]).toBeDefined();
  vi.restoreAllMocks();
});

test("isDismissed is case-sensitive", () => {
  writeDismissal("Bananas", 3);
  expect(isDismissed("bananas")).toBe(false);
});
