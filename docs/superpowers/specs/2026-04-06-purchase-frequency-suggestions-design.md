# Purchase Frequency Auto-Suggestions

**Date:** 2026-04-06
**Status:** Approved

## Overview

Proactively suggest items to add to the shopping list based on how frequently the user purchases them. A cycling dismissable banner above the SmartInputBar surfaces one suggestion at a time when an item is within its relevance window.

## Data model change

Add a `purchased_at` nullable datetime column to `list_items`:

```python
purchased_at: Optional[datetime] = None
```

Set to `now()` in the items PATCH handler when `purchased` is flipped to `true`. Never updated on subsequent edits. Requires an Alembic migration.

The frequency model uses `purchased_at` (not `created_at`) as the purchase timestamp — it represents when the item was actually bought rather than when it was added to the list.

## Backend

### Items PATCH handler change

When processing a PATCH on a list item, if `purchased` is being set to `true` and the item's current `purchased_at` is `None`, set `purchased_at = now()`.

### New endpoint: `GET /lists/{list_id}/due-suggestions`

Protected by `require_member`. Returns items that are currently "due" for re-purchase.

**Query logic:**

1. Load all `list_items` rows for `list_id` where `purchased_at IS NOT NULL`
2. Group by `lower(name)`, discard groups with fewer than 3 purchased occurrences
3. For each group, sort `purchased_at` ascending and compute consecutive gaps in days; take the **median** gap as `median_interval`
4. Compute `days_since_last` = days since the most recent `purchased_at` in the group
5. Apply relevance window filter: `0.9 × median_interval ≤ days_since_last ≤ 1.5 × median_interval`
6. Exclude names that currently exist on `list_id` with `purchased = false`
7. Sort descending by `days_since_last / median_interval` (most overdue first)
8. Limit to 10 results
9. Return the `name`, `brand`, `stores` from the most recent row in each group, plus computed fields

Frequency is scoped to the current list only — cross-list history is not considered.

**Response schema** (`DueSuggestionRead`):

```python
class DueSuggestionRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]
    days_overdue: float        # days_since_last - (0.9 × median_interval)
    dismissal_ttl_days: float  # (1.5 × median_interval) - days_since_last
```

`dismissal_ttl_days` tells the frontend exactly how long a dismissal should last so it expires when the suggestion window closes.

## Frontend

### Data fetch

`ListScreen` calls `GET /lists/{list_id}/due-suggestions` once on mount. Result stored in local state. No polling — suggestions are recalculated on the next list open.

On load, filter out suggestions where `localStorage` contains a non-expired dismissal entry for that name.

### `FrequencySuggestionBanner` component

Placed in `ListScreen` directly above `SmartInputBar`. Hidden entirely when no eligible suggestions remain.

**Props:**
- `suggestions: DueSuggestion[]`
- `onAdd: (suggestion: DueSuggestion) => void`
- `onDismiss: (name: string) => void`

**Internal state:**
- `currentIndex: number` — index into the eligible suggestions array (those not in localStorage dismissals)

Eligible suggestions are derived on each render by filtering the `suggestions` prop against the current localStorage dismissal entries.

**Cycling:** `setInterval` of 6 seconds advances `currentIndex`. Wraps around within eligible suggestions. If eligible suggestions becomes empty, the banner hides.

**Banner card shows:**
- Item name (bold)
- Brand and stores as small secondary text (if present)
- **"+ Añadir"** button → calls `onAdd`, permanently removes from banner for this session
- **"✕"** button → calls `onDismiss`, immediately advances to next eligible item

### Dismissal persistence (`localStorage`)

Key: `cqs_dismissed_suggestions`
Value: `Record<string, string>` — `{ [itemName]: ISO timestamp of expiry }`

On dismiss: write `name → new Date(Date.now() + dismissal_ttl_days * 86400000).toISOString()`

On load: filter entries where `Date.now() < Date.parse(dismissedUntil)`. Stale entries can be pruned on read.

The TTL comes from `dismissal_ttl_days` on each suggestion, so the dismissal expires exactly when the suggestion's relevance window closes — ensuring dismissed suggestions never outlive their window.

### `onAdd` flow

Calls the existing `addItem` with `{ name, brand, stores }` from the suggestion. No special handling beyond what `addItem` already does.

## Error handling

- Fetch failure is non-critical (same pattern as `/suggestions`): catch silently, render no banner.
- Empty result: no banner rendered.

## Testing

**Backend:**
- Migration: `purchased_at` column added to `list_items`
- Items PATCH: sets `purchased_at` when `purchased` flips to `true`, does not overwrite on re-purchase
- Unit tests for the median interval calculation
- Endpoint test: returns correct suggestions given seeded `list_items` with `purchased_at` set
- Endpoint test: excludes items currently unpurchased on the target list
- Endpoint test: respects the 0.9× lower bound and 1.5× upper bound
- Endpoint test: requires ≥3 purchased occurrences

**Frontend:**
- `FrequencySuggestionBanner` renders one suggestion at a time
- Dismiss writes to localStorage and advances index
- Add calls `onAdd` and hides the suggestion
- Banner hidden when suggestions array is empty
- localStorage TTL expiry correctly filters stale dismissals
