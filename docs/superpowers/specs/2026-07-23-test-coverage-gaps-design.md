# Test Coverage Gaps Audit — Design Spec

**Date:** 2026-07-23  
**Status:** Approved  

---

## Overview

As part of technical debt investigation for **JAV-16**, this document captures a point-in-time audit of the frontend test suite coverage using `vitest --coverage`. The goal is to identify testing gaps in critical UI screens, hooks, and libraries, and guide future test-writing efforts.

Per project owner direction, no permanent coverage dependencies, configuration options, or scripts are committed to the codebase. The audit was conducted using a temporary installation of `@vitest/coverage-v8`.

---

## Overall Coverage Statistics

The frontend test suite consists of **586 tests** across **45 test files**. The overall coverage metrics are as follows:

| Metric | Coverage |
| :--- | :--- |
| **Statements** | 71.37% |
| **Branches** | 65.93% |
| **Functions** | 67.07% |
| **Lines** | 72.63% |

---

## Key Gaps Identified

We analyzed the Vitest coverage report to find files with the lowest coverage or high complexity but missing test cases. The major test gaps are categorized below:

### 1. Completely Untested Components (0% Coverage)

- **`ProductHistorySheet.tsx`** (Statements: 0%, Lines: 0%)
  - *Gaps:* Uncovered lines `27-446`. This component handles the list's product suggestions from history and has zero unit tests.

### 2. Core Components with Critical Gaps

- **`ListScreen.tsx`** (Statements: 39.19%, Lines: 41.15%)
  - *Gaps:* Uncovered lines `443-545` (handles list item mutations, item filtering, sorting details) and `628-936` (render logic, drag-and-drop state, action handlers). This is the main UI screen of the application and contains significant untested complex rendering/interaction logic.
- **`LogPurchaseSheet.tsx`** (Statements: 73.46%, Lines: 77.27%)
  - *Gaps:* Uncovered lines `98-99`, `139-202` (handles logging prices, validating quantities, date pickers, store selectors).
- **`ReceiptScanSheet.tsx`** (Statements: 82.6%, Lines: 83.95%)
  - *Gaps:* Uncovered lines `297-298`, `326-354` (receipt review table, line matching overrides, and custom receipt action items).

### 3. Untested Hooks and Libraries

- **`useSwipeToDismiss.ts`** (Statements: 23.8%, Lines: 26.31%)
  - *Gaps:* Uncovered lines `16-18`, `23-26`, `31-39` (touch event listeners, translation calculations, swipe thresholds).
- **`useListItems.ts`** (Statements: 68.94%, Lines: 68.96%)
  - *Gaps:* Uncovered lines `375-388` (offline item update rollbacks) and `407-410`.
- **`api.ts`** (Statements: 61.22%, Lines: 57.77%)
  - *Gaps:* Uncovered lines `189-234` (Firebase token validation / error formatting) and `268-332` (receipt fuzzy match API wrapper, feedback form posting).
- **`lowestPriceStore.ts`** (Statements: 18.18%, Lines: 20.00%)
  - *Gaps:* Uncovered lines `10-22` (caching strategies and store price comparison helpers).

---

## Actionable Recommendations for Future Work

When prioritizing coverage improvement tasks, the following sequential path is recommended:

1. **Test `ProductHistorySheet.tsx`:** Write a dedicated `ProductHistorySheet.test.tsx` file asserting suggestion selection, history list rendering, and empty states.
2. **Increase `ListScreen.tsx` Coverage:** Write integration tests in `ListScreen.test.tsx` targeting specific interaction sequences (e.g., drag and drop, filtering/sorting behavior changes).
3. **Isolate Touch Logic Tests for `useSwipeToDismiss.ts`:** Write hook-specific unit tests mocking touch events to verify swipe/dismiss translation calculations.

---

## Out of Scope

- Excludes permanent configuration of Vitest coverage options in `vite.config.ts`.
- Excludes adding scripts to `package.json` or `justfile`.
