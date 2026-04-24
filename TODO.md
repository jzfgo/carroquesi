# CarroQueSí — TODO

> Last updated: 2026-04-24

---

## Features (Backlog)

- [ ] **Offline support** — PWA is installable but data mutations while offline are not queued; add a service-worker write queue (background sync)
- [ ] **Push notifications** — notify list members when items are added or purchased (requires FCM setup)
- [ ] **Item reordering** — drag-and-drop to manually reorder unpurchased items
- [ ] **Manual item grouping** — allow users to manually group related items (e.g. a barcode-scanned yogurt alongside a free-text "yogurt" entry, or a branded item next to its unbranded equivalent)
- [ ] **In-app feedback** — unobtrusive prompt (e.g. after a purchase session) asking the user to rate the app or report a bug; also expose a permanent "Enviar feedback" option in the user menu so users can submit anytime; feedback should be lightweight (free-text + optional email) and not require leaving the app
- [ ] **Multi-language / i18n** — UI is currently Spanish/English mixed; pick one or add i18n support

---

## Bugs / Known Issues

- [ ] **Price history mixed unit normalization** — `PriceHistorySheet` charts and stats treat per-unit and per-weight prices as incomparable series, so a history that mixes both formats produces a misleading chart (e.g. a 500 g item logged once as `1 €/kg` and once as `0.60 €` will show two disconnected data points instead of a consistent `€/kg` trend); the app should detect when an item has a known weight quantity and attempt to normalise all entries to a common basis (e.g. always `€/kg`) before rendering; needs brainstorming — edge cases include unknown or variable quantities, items with no `price_per`, mixed SI units (`g` vs `kg`), and entries where the quantity changed between purchases
- [ ] **Root tsconfig always passes** — `tsconfig.json` has `files: []` so `tsc` never reports errors at the root level; CI should always use `npx tsc -p tsconfig.app.json --noEmit` (documented in CLAUDE.md but easy to miss)
- [ ] **`vite-plugin-pwa` peer dep warning** — `--legacy-peer-deps` is required because vite-plugin-pwa@1.x doesn't declare Vite 8 peer support; remove once upstream fixes it
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
