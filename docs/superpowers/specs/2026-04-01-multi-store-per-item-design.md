# Multi-store per list item

**Date:** 2026-04-01
**Status:** Approved

## Problem

Open Food Facts can return multiple stores for a product. Currently the app saves only the first one. Users who shop at more than one store lose useful availability information.

## Goal

Allow each list item to be associated with multiple stores. When a user filters by store, they see all items tagged with that store plus all items with no store set — the same behaviour as today, extended to match against a list.

## Semantics

Multiple stores on an item mean: "I buy this product at these stores." It is a shopping signal, not a catalogue fact. No store set means "buy it anywhere."

## Decisions

| Question | Decision |
|---|---|
| Storage format | JSON column (`stores: list[str]`), default `[]` |
| SQLite compat | `Column(JSON)` maps to TEXT in SQLite — tests unaffected |
| Sort by store | Drop `?sort=store` — filtering is the primary use case |
| Input (text) | Multiple `@` sigils: `Leche @Mercadona @Carrefour` |
| Input (editor) | TagEditSheet: add/remove individual store chips |
| Barcode scan | Selectable chips, none pre-selected; saved stores = user selection |
| PATCH semantics | `stores` is a full replacement, not additive |

## Architecture

### Data layer

**Migration** (Alembic):
1. Add `stores` column — `JSON`, server default `'[]'`
2. Backfill: `stores = [store]` where `store IS NOT NULL`, else `[]`
3. Drop `store` column

**Model** (`backend/app/db/models.py`):
```python
stores: list[str] = Field(default_factory=list, sa_column=Column(JSON))
```

**Schemas** (`backend/app/schemas/items.py`):
- `ItemCreate`: `stores: list[str] = []`
- `ItemUpdate`: `stores: list[str] | None = None` — `None` means "don't touch stores"; `[]` means "remove all stores"
- `ItemRead`: `stores: list[str]`
- `SuggestionRead`: `stores: list[str]`

### API

All item responses change from `"store": "Mercadona"` to `"stores": ["Mercadona", "Carrefour"]`. Clients sending `store` in POST/PATCH bodies will get a 422 — both sides are updated together.

### Frontend

**`types.ts`:**
```ts
// Before
store: string | null
// After
stores: string[]
```
Affected: `ListItem`, `ParsedInput`, `Suggestion`.

**`parseInput.ts`:**
Collect all `@token` matches into `stores: string[]` instead of stopping at the first one.

**`ListScreen`** filter predicate:
```ts
item.stores.includes(activeStore) || item.stores.length === 0
```

**`StoreFilter`:**
Unique store list = `[...new Set(items.flatMap(i => i.stores))]`

### Components

**`ItemCard`:** Render one chip per store. Tapping any chip opens TagEditSheet.

**`TagEditSheet` (stores mode):**
- List current stores as chips with × to remove
- Text input with client-side suggestions to add a new store
- On confirm: PATCH `stores` with the full updated list

**`SmartInputBar`:**
- `parseInput` already drives the preview — updating it to return `stores: string[]` is enough
- Preview renders one 🏪 chip per store

**`BarcodeScanSheet`:**
- Show all stores from `BarcodeRead.stores` as toggleable chips, none selected by default
- Pass `selectedStores` (may be empty) when calling `onAdd`

### Suggestions

Server-side: `SuggestionRead.stores` replaces `store`. The query already picks the most recent item per product name — `stores` comes along for free.

Client-side: `clientSideSuggestions` for the `store` field key becomes `stores`, but the suggestions list is still a flat list of unique store strings drawn from `item.stores`.

## Out of scope

- Notifying users when they enter a store where items are available (push/geofence)
- Per-store quantities or prices
- Reordering stores on an item
