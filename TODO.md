# CarroQueSí — TODO

> Last updated: 2026-05-30

---

## Bugs / Known Issues

- [ ] **Improve due suggestions** - The current frequency banner gives no context for why an item is being suggested, which is confusing. Direction: replace or supplement it with a ✨ button + counter inside the SmartInputBar that opens a sheet or popover listing due items with human-readable frequency context (e.g. "usually buy diapers once a week"). Needs design discussion at implementation time.
---

## Features (Backlog)

- [ ] **Purchased quantity** - The actual purchased qty of an item may vary from the original qty when unpurchased (i.e. 2 cucumbers vs. 500g of cucumbers). Item cost should be calculated from the actual purchased quantity. Primary source is receipt scanning; manual entry should also be possible both before and after scanning. Needs design discussion at implementation time.
- [ ] **Buy this item again** - Each purchased item should have an option to clone it as a new unpurchased item (preserving name, brand, stores, and quantity from the purchased original), keeping the purchase history of the original intact
- [ ] **Impulse buys** - From the ReceiptScanSheet, allow adding items that were purchased but weren't on the list (impulse buys, forgotten items). These are created directly in purchased state for spend tracking purposes; no behavioral distinction between impulse vs. forgotten. Depends on receipt scanning feature.
- [ ] **Receipt scanning — list seeding** — pre-purchase: import items from a past receipt to seed or rebuild a list
- [ ] **Better item suggestion in input bar** - Two issues with current autocomplete suggestions: (1) tapping a suggestion fills the text input instead of adding the item directly — it should clone the suggested item (name + brand + stores) straight to the list, bypassing the input bar; (2) brand is not applied when a suggestion is selected, which breaks price tracking since history is matched by name+brand. The `/suggestions` endpoint already returns `brand` and `stores`; the fix is primarily in how the frontend handles suggestion selection.
- [ ] **Suggested quantity in due suggestions** — when the frequency banner fires, suggest the average quantity purchased per shopping event for that item (e.g. buying 6, 1, 2 beers → suggest 3); requires: (1) backend computes `avg_quantity` across purchase events for each due item and adds it to `DueSuggestionRead`, (2) `handleSuggestionAdd` in `ListScreen` passes the suggested quantity to the new-item payload, (3) banner optionally displays it. Quantity strings must be parsed to numeric (strip units/sigils) and rounded before averaging; items with no parseable quantity default to `null` (no suggestion).
- [ ] **Feature flags** — per-user feature toggles to gate functionality (e.g. `ai_receipt_scanning`) during dogfooding and future paid tiers; requires: (1) `UserFeature` model + migration (`user_id`, `feature: str`, `enabled: bool`, `granted_by: 'admin' | 'plan'`); (2) a thin `feature_flags.is_enabled(user_id, feature)` service function as the single internal call site — isolates the implementation so the backing store can be swapped later; (3) feature state included in `GET /users/me` response so the frontend can gate UI elements at startup; (4) admin identity read from the `is_admin` JWT claim in `get_current_user` (`claims.get("is_admin", False)`) — set via Firebase Admin SDK (`auth.set_custom_user_claims`), compatible with any OAuth provider that supports custom claims; (5) admin-only `PATCH /admin/users/{id}/features` endpoint protected by a `require_admin` dependency that reads `current_user.is_admin`; (6) guard the Gemini receipt scanning endpoint behind `ai_receipt_scanning` as the first flag. No external dependency beyond the existing auth provider — feature state backed by Postgres.
- [ ] **Siri Shortcuts integration** — allow iOS/macOS users to interact with CQS via Siri without a native app; requires: (1) `ApiKey` model + migration (static per-user token, `last_used_at` tracking) and a `get_user_from_api_key` FastAPI dependency as an alternative auth path to Firebase tokens; (2) `GET /shortcuts/cqs.shortcut` endpoint that generates a signed `.shortcut` plist dynamically with the user's API key and default list ID embedded — removing all manual configuration on the user's side; (3) a single multi-action Shortcut supporting at minimum `add_item` (with Siri-prompted parameter) and `read_list`, with a menu fallback for less frequent actions; (4) Apple platform detection (`/iPhone|iPad|Mac/.test(navigator.userAgent)`) in the frontend — show an "Añadir atajo a Siri" button in Settings or the list header only on Apple devices; (5) API key revocation ("Regenerar clave") in user settings. The API key infrastructure is also the foundation for a future MCP Server.
- [ ] **MCP Server (API key auth)** — expose CQS as an MCP server so users can interact with their lists from Claude, ChatGPT, Gemini, and other MCP-compatible clients; builds directly on the `ApiKey` infrastructure introduced by Siri Shortcuts; requires: (1) `POST /mcp` endpoint implementing the MCP protocol (JSON-RPC over HTTP); (2) tools: `get_lists`, `get_list_items`, `add_item` (accepting name, quantity, brand, store — mapped to the existing sigil system), `mark_purchased`, `get_due_suggestions`; (3) resources: `lists://` and `lists://{id}/items` for read-only context; (4) authentication via `X-Api-Key` header using the existing `get_user_from_api_key` dependency — no OAuth required at this stage; (5) register on mcp.so and the Anthropic directory once stable. OAuth 2.0 Authorization Server can be layered on top later to enable one-click connection from MCP client marketplaces without manual API key distribution.
- [ ] **Push notifications** — notify list members when items are added or purchased (requires FCM setup)
- [ ] **Manual item grouping** — allow users to manually group related items (e.g. a barcode-scanned yogurt alongside a free-text "yogurt" entry, or a branded item next to its unbranded equivalent)
- [ ] **In-app feedback** — unobtrusive prompt (e.g. after a purchase session) asking the user to rate the app or report a bug; also expose a permanent "Enviar feedback" option in the user menu so users can submit anytime; feedback should be lightweight (free-text + optional email) and not require leaving the app
- [ ] **Multi-language / i18n** — UI is currently Spanish/English mixed; pick one or add i18n support
- [ ] **Count-based price normalization** — follow-up to price history mixed unit normalization; items bought in packs of varying unit counts (e.g. 6-pack vs 4-pack of toilet rolls) cannot yet be normalized to a per-item basis; requires a new `pack_size` field on `ListItem`, UI changes in `LogPriceSheet`/`ItemCard`, and a `price_per='UNIT'` concept
- [ ] **Varying pack size (all per-unit) normalization** — follow-up to price history mixed unit normalization; items always logged as per-unit but with different pack sizes (e.g. yogurt in 125 g vs 250 g pots) are not normalized unless at least one entry has a parseable SI quantity or is explicitly €/kg; full support requires per-entry quantity snapshots in a dedicated price history table

---

## Refactoring / Tech Debt

- [ ] **Short-poll → WebSocket or SSE** — the 5-second poll works but adds unnecessary load; evaluate Server-Sent Events for real-time item updates
- [ ] **API error handling in frontend** — most fetch calls lack granular error handling; add a unified error boundary or toast for network failures
- [ ] **Test coverage gaps** — backend tests use SQLite in-memory (good), but frontend test suite coverage is unknown; audit with `vitest --coverage`
- [ ] **Frequency suggestion dismissal TTL** — dismissals are stored in `localStorage` with a backend-computed TTL; verify the TTL logic handles timezone edge cases correctly

---

## Infrastructure / DevOps

- [ ] **Secrets management** — `firebase-credentials.json` and `.env` files are gitignored but there's no documented rotation process; consider Google Secret Manager for Cloud Run
- [ ] **Database backups** — no automated backup policy documented for the Cloud SQL / Postgres instance
- [ ] **Alembic migration on Cloud Run startup** — currently runs `alembic upgrade head` at container start; this blocks readiness and could cause issues on rollbacks; consider a dedicated migration job
