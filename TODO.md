# CarroQueSí — TODO

> Last updated: 2026-04-22

---

## Features (Backlog)

- [x] **`$` sigil in SmartInputBar** — add a `$` sigil (alongside `@` for store, `#` for brand, etc.) to log an item's price inline at add time; e.g. `leche $1.50 @Mercadona` should pre-fill the price field without opening the price sheet
- [x] **Estimated total cost** — show a running estimated total for unpurchased items in the list header; show a "spent today" cost summary grouped by calendar day for purchased items (requires items to have a price logged)
- [x] **Progress bar scope fix** — the progress bar only counts unpurchased items and items purchased on the current calendar day; prior-day items are excluded from both numerator and denominator
- [ ] **Auto-archive purchased items** — automatically move purchased items out of the active list after a configurable threshold (e.g. 24 h or next calendar day); keeps the active list clean without requiring manual deletion
- [ ] **Offline support** — PWA is installable but data mutations while offline are not queued; add a service-worker write queue (background sync)
- [ ] **Push notifications** — notify list members when items are added or purchased (requires FCM setup)
- [ ] **List archiving** — allow completed shopping trips to be archived instead of deleted
- [ ] **Item reordering** — drag-and-drop to manually reorder unpurchased items
- [ ] **Quoted sigil values in SmartInputBar** — support wrapping a sigil's value in single or double quotes so brand/store names containing spaces or sigil characters work correctly (e.g. `#'Marca + Bio'`, `#"Eco +"`, `@'El Corte Inglés'`); requires updating `parseInput.ts` to detect an opening quote after the sigil and consume tokens until the closing quote
- [ ] **Store suggestion when logging price** — when opening the log-price flow for an item that has no stores set, pre-fill the store field with the last store the user specified when adding a price, provided that price was logged less than one hour ago (i.e. same shopping session heuristic); store the last-used store + timestamp in `localStorage`
- [x] **Deduplicate unpurchased items** — prevent adding an item that already exists in the unpurchased list; if the same EAN is scanned twice or the same name is typed again, silently block the addition and show a brief "ya está en la lista" toast — no further action offered
- [ ] **List filtering** — allow users to filter both the unpurchased and purchased sections by free-text name and/or sigil values (`#brand`, `@store`); multiple sigils of the same type should OR together while different types AND together (e.g. `@Mercadona @Ahorramas #Danone` shows Danone items available at either Mercadona or Ahorramas); filter state should be ephemeral (cleared on navigation) and not affect the underlying data
- [ ] **Manual item grouping** — allow users to manually group related items (e.g. a barcode-scanned yogurt alongside a free-text "yogurt" entry, or a branded item next to its unbranded equivalent)
- [ ] **In-app feedback** — unobtrusive prompt (e.g. after a purchase session) asking the user to rate the app or report a bug; also expose a permanent "Enviar feedback" option in the user menu so users can submit anytime; feedback should be lightweight (free-text + optional email) and not require leaving the app
- [ ] **Multi-language / i18n** — UI is currently Spanish/English mixed; pick one or add i18n support

---

## Bugs / Known Issues

- [ ] **Price edit missing store field** — when editing an already-logged price entry that has a store associated, the edit form should allow the user to change or remove that store; currently the store field is absent from the edit flow, making logged store data effectively immutable
- [ ] **Delete a logged price entry** — users should be able to delete a price entry within the existing 24 h editing window; the delete action should live in the same edit UI (e.g. a "Eliminar" button) and call `DELETE /lists/{id}/items/{item_id}/prices/{price_id}` (endpoint to be added)
- [ ] **Price history mixed unit normalization** — `PriceHistorySheet` charts and stats treat per-unit and per-weight prices as incomparable series, so a history that mixes both formats produces a misleading chart (e.g. a 500 g item logged once as `1 €/kg` and once as `0.60 €` will show two disconnected data points instead of a consistent `€/kg` trend); the app should detect when an item has a known weight quantity and attempt to normalise all entries to a common basis (e.g. always `€/kg`) before rendering; needs brainstorming — edge cases include unknown or variable quantities, items with no `price_per`, mixed SI units (`g` vs `kg`), and entries where the quantity changed between purchases
- [x] **Duplicate stores via `@` sigil** — `parseInput.ts` does not deduplicate stores, so typing `@Mercadona @Mercadona` results in the same store appearing twice in the item's stores array; fix by deduplicating parsed stores before returning the `ParsedInput`
- [ ] **List screen has no route** — the list screen is not mounted at a dedicated URL (e.g. `/lists/:id`), so refreshing the page or sharing the URL drops the user back to the dashboard; each list should have a stable, bookmarkable route and the router should handle deep-linking directly to it
- [ ] **Dashboard stale after list edits** — navigating back to the dashboard after adding, removing, purchasing, or unpurchasing items does not refresh the list cards; the progress bar and item counters continue to show the state from when the dashboard was last loaded; the dashboard should re-fetch (or receive invalidated) list summaries on focus/navigation so the cards are always current
- [ ] **Root tsconfig always passes** — `tsconfig.json` has `files: []` so `tsc` never reports errors at the root level; CI should always use `npx tsc -p tsconfig.app.json --noEmit` (documented in CLAUDE.md but easy to miss)
- [x] **Polling on hidden tab** — the 5-second poll (`GET /lists/{id}/updated-at`) keeps firing when the tab is in the background; consider pausing with `visibilitychange`
- [ ] **`vite-plugin-pwa` peer dep warning** — `--legacy-peer-deps` is required because vite-plugin-pwa@1.x doesn't declare Vite 8 peer support; remove once upstream fixes it
- [ ] **Invite link OG preview** — `GET /i/{invite_id}` serves an OG meta-tag page; test that WhatsApp / iMessage actually unfurl it correctly in production

---

## Infrastructure / DevOps

- [x] **CI pipeline** — no GitHub Actions workflow remains after removing `claude-code-review`; add a basic CI job (typecheck + lint + test) on PRs
- [ ] **Secrets management** — `firebase-credentials.json` and `.env` files are gitignored but there's no documented rotation process; consider Google Secret Manager for Cloud Run
- [ ] **Database backups** — no automated backup policy documented for the Cloud SQL / Postgres instance
- [ ] **Alembic migration on Cloud Run startup** — currently runs `alembic upgrade head` at container start; this blocks readiness and could cause issues on rollbacks; consider a dedicated migration job

---

## Refactoring / Tech Debt

- [ ] **Short-poll → WebSocket or SSE** — the 5-second poll works but adds unnecessary load; evaluate Server-Sent Events for real-time item updates
- [ ] **API error handling in frontend** — most fetch calls lack granular error handling; add a unified error boundary or toast for network failures
- [ ] **Test coverage gaps** — backend tests use SQLite in-memory (good), but frontend test suite coverage is unknown; audit with `vitest --coverage`
- [ ] **Frequency suggestion dismissal TTL** — dismissals are stored in `localStorage` with a backend-computed TTL; verify the TTL logic handles timezone edge cases correctly
