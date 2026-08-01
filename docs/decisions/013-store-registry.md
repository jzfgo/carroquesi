# ADR-013: Per-list store registry for canonical display names

**Status:** Accepted
**Date:** 2026-08-01

## Context

Store names are free text from four sources — typed `@store` sigils, the
Gemini receipt parse, Open Food Facts crowd data, and price logging — and
no two people spell a shop the same way. PR #219 (JAV-82) made every
comparison go through a deterministic `store_key()`, which collapsed the
duplicate chips and split price histories. It left display on "the first
typed form": whichever spelling happened to arrive first became the
label, with no way to fix `Ahorra Más` to the chain's actual `Ahorramas`
without editing every item.

The product wants canonical labels. The canonical form has to live
somewhere, and there were three honest sources for it:

- **A registry the household can rename.** One row per store key per
  list, display name editable once, every surface follows.
- **A frequency heuristic** — the most-typed variant wins. No schema, but
  a popular misspelling stays crowned and the label can flip when counts
  cross.
- **A curated chain list.** Covers Mercadona and Ahorramas, does nothing
  for `Frutería de Ana`, needs maintenance, and PRODUCT.md frames store
  names as user-entered data rather than a taxonomy.

## Decision

A `list_stores` table: `(list_id, store_key)` unique, `display_name` free
text. Every write that introduces a store string registers it (items,
prices, receipt apply); the first typed form seeds the label and later
spellings never touch it. Members rename an entry from the list action
sheet; the rename bumps `lists.updated_at` so other members' polls
repaint. The one-time backfill seeds each key's label with the most
frequent variant (tie: first seen) — a heuristic renames fix afterwards.

**Per-list, not global.** Store labels are household data. A global table
would leak one household's naming into another and would make renames
contested; the issue's own analysis of the (then global) mapping table
flags exactly that failure.

**Item rows keep the raw typed strings.** Only rendering resolves through
the registry (`displayStore` in `useListItems`), so a rename rewrites
nobody's data and the raw string remains available as a fallback when a
key is not yet registered.

**`store_key` is immutable; `display_name` is unconstrained.** A rename
may produce a display name whose own key differs from the row's key
(fixing `Merca` to `Mercadona`). That divergence is display-only and
harmless; making the keys converge is aliasing, which is deferred.

## Consequences

- Chips, price-history groups, item tags, and sheets all show one label
  per shop, fixable once by anyone in the household.
- Vocabulary variants (`BM` vs `BM Supermercados`) remain two stores. No
  deterministic rule can merge them without also merging `Carrefour` into
  `Carrefour Express`; merging needs a human decision. Suggest-on-entry
  and explicit alias/merge are follow-up work, and the registry is the
  natural place to hang an alias when that lands.
- The list cache grows a `stores` slice so offline paints canonical
  labels; old caches without it degrade to raw strings.
- A store that exists only in historical data enters the registry via the
  backfill; one introduced later enters on its first write. There is no
  path that displays a key the registry cannot resolve — the raw string
  fallback covers the gap between a write and its poll.
