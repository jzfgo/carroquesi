# Due Suggestions Redesign

**Date:** 2026-05-30
**Status:** Approved

## Problem

The `FrequencySuggestionBanner` cycles through due suggestions one at a time every 6 seconds and gives no context for why an item is being suggested. Users don't know if an item is suggested weekly or monthly, which makes the feature feel arbitrary and easy to ignore.

## Decision

Replace the banner entirely with a ✨ button on the left of the SmartInputBar. The button shows a badge with the count of due suggestions and opens a bottom sheet ("Toca comprar") listing all due items with human-readable frequency and recency context.

## Data Layer

### Backend — `DueSuggestionRead` schema

Add two new fields to `backend/app/schemas/due_suggestions.py`:

```python
median_interval_days: float   # median gap between purchases in days
days_since_last: float        # days since the item was last purchased
```

Both values are already computed as local variables in `get_due_suggestions` (`suggestions.py`). No new queries or migrations required — they just need to be passed through to the response object.

### Frontend — `DueSuggestion` type

Mirror the two new fields in the `DueSuggestion` type in `frontend/src/types.ts`.

### Frontend — utility functions (`frontend/src/lib/suggestions.ts`)

**`formatFrequency(days: number): string`**

Bucketed labels (in Spanish):

| Range (days) | Label |
|---|---|
| < 2 | `"cada día"` |
| 2–6 | `"cada X días"` (e.g. `"cada 3 días"`) |
| 7–13 | `"cada semana"` |
| 14–27 | `"cada X semanas"` (e.g. `"cada 2 semanas"`) |
| 28–59 | `"cada mes"` |
| ≥ 60 | `"cada X meses"` (rounded) |

**`formatRecency(days: number): string`**

- < 14 days → `"hace X días"`
- 14–59 days → `"hace X semanas"`
- ≥ 60 days → `"hace X meses"`

## Components

### Deleted: `FrequencySuggestionBanner`

Remove `FrequencySuggestionBanner.tsx`, `FrequencySuggestionBanner.css`, and `FrequencySuggestionBanner.test.tsx`. Remove the import and usage from `ListScreen.tsx`.

### New: `DueSuggestionsSheet`

**File:** `frontend/src/components/DueSuggestionsSheet.tsx`

**Props:**
```ts
interface Props {
  suggestions: DueSuggestion[]
  onAdd: (s: DueSuggestion) => void
  onDismiss: (s: DueSuggestion) => void
  onClose: () => void
}
```

A standard bottom sheet (follow existing sheet pattern in the codebase). Each row renders:
- Item name (bold)
- Brand · stores (subtitle, omitted if both absent)
- Purple pill chip: `formatFrequency(s.median_interval_days)` — e.g. `"cada semana"`
- Green pill chip: `formatRecency(s.days_since_last)` — e.g. `"hace 8 días"`
- `+ Añadir` button (calls `onAdd`)
- `✕` dismiss button (calls `onDismiss`)

When the suggestions list is empty (all items added or dismissed), the sheet calls `onClose` on render.

### Modified: `SmartInputBar`

Two new optional props:

```ts
dueSuggestionsCount?: number
onDueSuggestionsOpen?: () => void
```

When `dueSuggestionsCount > 0`, render a ✨ button to the **left of the text input** with a purple badge showing the count. Tapping it calls `onDueSuggestionsOpen`. When count is 0 or undefined, the button is absent.

## State (`ListScreen`)

- Add `dueSuggestionsOpen: boolean` state (default `false`)
- Pass `dueSuggestions.filter(s => !isDismissed(s.name)).length` as `dueSuggestionsCount` to `SmartInputBar`
- Pass `() => setDueSuggestionsOpen(true)` as `onDueSuggestionsOpen`
- Add `handleSuggestionDismiss(s: DueSuggestion)`: calls `writeDismissal(s.name, s.dismissal_ttl_days)` and filters `s` out of `dueSuggestions` state
- Existing `handleSuggestionAdd` already filters the item out of state — no change needed
- Mount `DueSuggestionsSheet` when `dueSuggestionsOpen && filteredSuggestions.length > 0`

## Dismissal

Unchanged — `writeDismissal` / `isDismissed` from `dismissedSuggestions.ts` work identically. The TTL comes from `s.dismissal_ttl_days` as before.

## Testing

### Backend (`test_due_suggestions.py`)
- Assert `median_interval_days` and `days_since_last` are present and numerically correct in the response.

### Frontend utilities (`suggestions.test.ts`)
- Unit tests for `formatFrequency` and `formatRecency` covering boundary values (e.g. 7 days → `"cada semana"`, 13 days → `"cada semana"`, 14 days → `"cada 2 semanas"`, 28 days → `"cada mes"`).

### `DueSuggestionsSheet` (new test file)
- Renders all rows with correct chip text
- Clicking `+ Añadir` removes the row and calls `onAdd`
- Clicking `✕` removes the row and calls `onDismiss` + `writeDismissal`
- Empty list triggers `onClose`

### `SmartInputBar` (existing test file)
- ✨ button renders when `dueSuggestionsCount > 0`
- ✨ button absent when count is 0 or prop is omitted

### Deleted
- `FrequencySuggestionBanner.test.tsx` removed along with the component.
