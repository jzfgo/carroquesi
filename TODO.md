# CarroQueSí — TODO

> Last updated: 2026-05-28

---

## Features (Backlog)

- [ ] **Remove price from unpurchased items** — the `$`/`€` sigil in SmartInputBar and the "add price" CTA on unpurchased item cards are not useful before purchase; remove both. Price entry should only be available on purchased items (already enforced as read-only in the other direction).
- [ ] **Impulse buys** - From the ReceiptScanSheet, allow adding items that were purchased but weren't on the list (impulse buys, forgotten items). These are created directly in purchased state for spend tracking purposes; no behavioral distinction between impulse vs. forgotten. Depends on receipt scanning feature.
- [ ] **Purchased quantity** - The actual purchased qty of an item may vary from the original qty when unpurchased (i.e. 2 cucumbers vs. 500g of cucumbers). Item cost should be calculated from the actual purchased quantity. Primary source is receipt scanning; manual entry should also be possible both before and after scanning. Needs design discussion at implementation time.
- [ ] **Buy this item again** - Each purchased item should have an option to clone it as a new unpurchased item (preserving name, brand, stores, and quantity from the purchased original), keeping the purchase history of the original intact
- [ ] **Better item suggestion in input bar** - Two issues with current autocomplete suggestions: (1) tapping a suggestion fills the text input instead of adding the item directly — it should clone the suggested item (name + brand + stores) straight to the list, bypassing the input bar; (2) brand is not applied when a suggestion is selected, which breaks price tracking since history is matched by name+brand. The `/suggestions` endpoint already returns `brand` and `stores`; the fix is primarily in how the frontend handles suggestion selection.
- [ ] **Suggested quantity in due suggestions** — when the frequency banner fires, suggest the average quantity purchased per shopping event for that item (e.g. buying 6, 1, 2 beers → suggest 3); requires: (1) backend computes `avg_quantity` across purchase events for each due item and adds it to `DueSuggestionRead`, (2) `handleSuggestionAdd` in `ListScreen` passes the suggested quantity to the new-item payload, (3) banner optionally displays it. Quantity strings must be parsed to numeric (strip units/sigils) and rounded before averaging; items with no parseable quantity default to `null` (no suggestion).
- [ ] **Receipt scanning — list seeding** — pre-purchase: import items from a past receipt to seed or rebuild a list
- [ ] **Push notifications** — notify list members when items are added or purchased (requires FCM setup)
- [ ] **Manual item grouping** — allow users to manually group related items (e.g. a barcode-scanned yogurt alongside a free-text "yogurt" entry, or a branded item next to its unbranded equivalent)
- [ ] **In-app feedback** — unobtrusive prompt (e.g. after a purchase session) asking the user to rate the app or report a bug; also expose a permanent "Enviar feedback" option in the user menu so users can submit anytime; feedback should be lightweight (free-text + optional email) and not require leaving the app
- [ ] **Multi-language / i18n** — UI is currently Spanish/English mixed; pick one or add i18n support
- [ ] **Count-based price normalization** — follow-up to price history mixed unit normalization; items bought in packs of varying unit counts (e.g. 6-pack vs 4-pack of toilet rolls) cannot yet be normalized to a per-item basis; requires a new `pack_size` field on `ListItem`, UI changes in `LogPriceSheet`/`ItemCard`, and a `price_per='UNIT'` concept
- [ ] **Varying pack size (all per-unit) normalization** — follow-up to price history mixed unit normalization; items always logged as per-unit but with different pack sizes (e.g. yogurt in 125 g vs 250 g pots) are not normalized unless at least one entry has a parseable SI quantity or is explicitly €/kg; full support requires per-entry quantity snapshots in a dedicated price history table
- [ ] **Offline support** — PWA is installable but data mutations while offline are not queued; add a service-worker write queue (background sync)
- [ ] **Item reordering** — drag-and-drop to manually reorder unpurchased items

---

## Bugs / Known Issues

- [ ] **Improve due suggestions** - The current frequency banner gives no context for why an item is being suggested, which is confusing. Direction: replace or supplement it with a ✨ button + counter inside the SmartInputBar that opens a sheet or popover listing due items with human-readable frequency context (e.g. "usually buy diapers once a week"). Needs design discussion at implementation time.
- [ ] **Lists can't be deleted** - List table dependencies prevent lists from being deleted
- [ ] **Login screen persists after login** - In some cases, the auth flow fails to redirect after logging in, keeping the user in the app's login screen

---

## Infrastructure / DevOps

- [ ] **Secrets management** — `firebase-credentials.json` and `.env` files are gitignored but there's no documented rotation process; consider Google Secret Manager for Cloud Run
- [ ] **Database backups** — no automated backup policy documented for the Cloud SQL / Postgres instance
- [ ] **Alembic migration on Cloud Run startup** — currently runs `alembic upgrade head` at container start; this blocks readiness and could cause issues on rollbacks; consider a dedicated migration job

---

## Refactoring / Tech Debt

- [ ] **Short-poll → WebSocket or SSE** — the 5-second poll works but adds unnecessary load; evaluate Server-Sent Events for real-time item updates
- [ ] **API error handling in frontend** — most fetch calls lack granular error handling; add a unified error boundary or toast for network failures
- [ ] **Test coverage gaps** — backend tests use SQLite in-memory (good), but frontend test suite coverage is unknown; audit with `vitest --coverage`
- [ ] **Frequency suggestion dismissal TTL** — dismissals are stored in `localStorage` with a backend-computed TTL; verify the TTL logic handles timezone edge cases correctly
