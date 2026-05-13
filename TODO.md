# CarroQueSí — TODO

> Last updated: 2026-05-02

---

## Features (Backlog)

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

- [ ] The hybrid filter/search doesn't show were there aren't items in the unpurchased list or none of the items have stores set.
- [ ] **Invite link OG preview** — `GET /i/{invite_id}` serves an OG meta-tag page; test that WhatsApp / iMessage actually unfurl it correctly in production

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
