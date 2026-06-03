# CarroQueSí — TODO

> Last updated: 2026-06-03

---

## Bugs / Known Issues

---

## Features (Backlog)

- [ ] **Impulse buys** - From the ReceiptScanSheet, allow adding items that were purchased but weren't on the list (impulse buys, forgotten items). These are created directly in purchased state for spend tracking purposes; no behavioral distinction between impulse vs. forgotten. Depends on receipt scanning feature.
- [ ] **Receipt scanning — list seeding** — pre-purchase: import items from a past receipt to seed or rebuild a list
- [ ] **Siri Shortcuts integration** — allow iOS/macOS users to interact with CQS via Siri without a native app; requires: (1) `ApiKey` model + migration (static per-user token, `last_used_at` tracking) and a `get_user_from_api_key` FastAPI dependency as an alternative auth path to Firebase tokens; (2) `GET /shortcuts/cqs.shortcut` endpoint that generates a signed `.shortcut` plist dynamically with the user's API key and default list ID embedded — removing all manual configuration on the user's side; (3) a single multi-action Shortcut supporting at minimum `add_item` (with Siri-prompted parameter) and `read_list`, with a menu fallback for less frequent actions; (4) Apple platform detection (`/iPhone|iPad|Mac/.test(navigator.userAgent)`) in the frontend — show an "Añadir atajo a Siri" button in Settings or the list header only on Apple devices; (5) API key revocation ("Regenerar clave") in user settings. The API key infrastructure is also the foundation for a future MCP Server.
- [ ] **MCP Server (API key auth)** — expose CQS as an MCP server so users can interact with their lists from Claude, ChatGPT, Gemini, and other MCP-compatible clients; builds directly on the `ApiKey` infrastructure introduced by Siri Shortcuts; requires: (1) `POST /mcp` endpoint implementing the MCP protocol (JSON-RPC over HTTP); (2) tools: `get_lists`, `get_list_items`, `add_item` (accepting name, quantity, brand, store — mapped to the existing sigil system), `mark_purchased`, `get_due_suggestions`; (3) resources: `lists://` and `lists://{id}/items` for read-only context; (4) authentication via `X-Api-Key` header using the existing `get_user_from_api_key` dependency — no OAuth required at this stage; (5) register on mcp.so and the Anthropic directory once stable. OAuth 2.0 Authorization Server can be layered on top later to enable one-click connection from MCP client marketplaces without manual API key distribution.
- [ ] **Push notifications** — notify list members when items are added or purchased (requires FCM setup)
- [ ] **Manual item grouping** — allow users to manually group related items (e.g. a barcode-scanned yogurt alongside a free-text "yogurt" entry, or a branded item next to its unbranded equivalent)
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
