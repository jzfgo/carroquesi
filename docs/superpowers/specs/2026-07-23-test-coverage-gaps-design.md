# Test Coverage Gaps Audit — Design Spec

**Date:** 2026-07-23  
**Status:** Approved  

---

## Overview

As part of technical debt investigation for **JAV-16**, this document captures the audit and subsequent resolution of frontend test suite coverage gaps. 

Vitest coverage is now permanently configured using `@vitest/coverage-v8` in `vite.config.ts`, with a dedicated `pnpm test:coverage` script in `package.json` and a modular `just frontend test-coverage` recipe.

---

## Overall Coverage Statistics

The frontend test suite consists of **603 tests** (up from 586) across **48 test files** (up from 45). The overall coverage metrics improved significantly after writing new tests:

| Metric | Before Audit | After Resolution |
| :--- | :--- | :--- |
| **Statements** | 71.37% | **80.91%** |
| **Branches** | 65.93% | **76.97%** |
| **Functions** | 67.07% | **75.41%** |
| **Lines** | 72.63% | **82.57%** |

---

## Key Gaps Resolved

We wrote comprehensive test files to resolve the major test gaps identified during the audit:

### 1. `PriceHistorySheet.tsx` (Increased from 0% to 92.99%)
- **Test File:** `frontend/src/components/PriceHistorySheet.test.tsx`
- **Coverage Added:** Asserts title rendering, API scope fetching ('this_list', 'my_lists', 'all'), empty states, community pricing display, grouping by store, sparkline charts, store row expansion detailed statistics, and log price triggers.

### 2. `useSwipeToDismiss.ts` (Increased from 23.8% to 100%)
- **Test File:** `frontend/src/hooks/useSwipeToDismiss.test.ts`
- **Coverage Added:** Unit tests cover React swipe-down calculations, style mutations (transition, transform) during drag events, snap-back logic, dismiss triggers, direction constraints (e.g. ignoring upward swipes), and graceful null-ref handling.

### 3. `lastPriceStore.ts` (Increased from 18.18% to 100%)
- **Test File:** `frontend/src/lib/lastPriceStore.test.ts`
- **Coverage Added:** Unit tests cover local storage get/set interactions, TTL duration expiration, JSON parse error recovery, and security/quota exception safety blocks.

### 4. `ListScreen.tsx` (Increased from 39.19% to 49.38%)
- **Test File:** `frontend/src/components/ListScreen.test.tsx`
- **Coverage Added:** Added integration tests covering interactive tag/brand edits (opening/saving via `TagEditSheet`), store additions (opening/saving via `StoreEditSheet`), item actions (renaming/deleting via `ItemActionSheet`), and EAN barcode lookup integrations (searching/resolving/adding found product).

---

## Remaining Gaps / Actionable Recommendations

For future coverage expansion, developers can target:
1. **Increase `ListScreen.tsx` Coverage (currently 49.38%):** Write further integration tests in `ListScreen.test.tsx` targeting remaining mutating handlers (e.g. clone/suggestions) and complex render paths.
2. **Expand `api.ts` Coverage (currently 61.22%):** Add mock API handler tests covering token validation recovery and other edge cases.
