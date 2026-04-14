# CarroQueSí — TODO

> Last updated: 2026-04-14

---

## Features (Backlog)

- [x] **`$` sigil in SmartInputBar** — add a `$` sigil (alongside `@` for store, `#` for brand, etc.) to log an item's price inline at add time; e.g. `leche $1.50 @Mercadona` should pre-fill the price field without opening the price sheet
- [ ] **Estimated total cost** — show a running estimated total for unpurchased items in the list header; show a "spent today" cost summary grouped by calendar day for purchased items (requires items to have a price logged)
- [ ] **Progress bar scope fix** — the progress bar should only count unpurchased items and items purchased on the current calendar day; items purchased on prior days should be excluded from both numerator and denominator
- [ ] **Auto-archive purchased items** — automatically move purchased items to an archive after a configurable threshold (e.g. 24 h or next calendar day); keeps the active list clean without requiring manual deletion
- [ ] **Offline support** — PWA is installable but data mutations while offline are not queued; add a service-worker write queue (background sync)
- [ ] **Push notifications** — notify list members when items are added or purchased (requires FCM setup)
- [ ] **List archiving** — allow completed shopping trips to be archived instead of deleted
- [ ] **Item reordering** — drag-and-drop to manually reorder unpurchased items
- [ ] **Deduplicate unpurchased items** — prevent adding an item that already exists in the unpurchased list; if the same EAN is scanned twice or the same name is typed again, silently block the addition and show a brief "ya está en la lista" toast — no further action offered
- [ ] **Manual item grouping** — allow users to manually group related items (e.g. a barcode-scanned yogurt alongside a free-text "yogurt" entry, or a branded item next to its unbranded equivalent)
- [ ] **In-app feedback** — unobtrusive prompt (e.g. after a purchase session) asking the user to rate the app or report a bug; also expose a permanent "Enviar feedback" option in the user menu so users can submit anytime; feedback should be lightweight (free-text + optional email) and not require leaving the app
- [ ] **Multi-language / i18n** — UI is currently Spanish/English mixed; pick one or add i18n support

---

## Bugs / Known Issues

- [ ] **Root tsconfig always passes** — `tsconfig.json` has `files: []` so `tsc` never reports errors at the root level; CI should always use `npx tsc -p tsconfig.app.json --noEmit` (documented in CLAUDE.md but easy to miss)
- [x] **Polling on hidden tab** — the 5-second poll (`GET /lists/{id}/updated-at`) keeps firing when the tab is in the background; consider pausing with `visibilitychange`
- [ ] **`vite-plugin-pwa` peer dep warning** — `--legacy-peer-deps` is required because vite-plugin-pwa@1.x doesn't declare Vite 8 peer support; remove once upstream fixes it
- [ ] **Invite link OG preview** — `GET /i/{invite_id}` serves an OG meta-tag page; test that WhatsApp / iMessage actually unfurl it correctly in production

---

## Infrastructure / DevOps

- [ ] **CI pipeline** — no GitHub Actions workflow remains after removing `claude-code-review`; add a basic CI job (typecheck + lint + test) on PRs
- [ ] **Secrets management** — `firebase-credentials.json` and `.env` files are gitignored but there's no documented rotation process; consider Google Secret Manager for Cloud Run
- [ ] **Database backups** — no automated backup policy documented for the Cloud SQL / Postgres instance
- [ ] **Alembic migration on Cloud Run startup** — currently runs `alembic upgrade head` at container start; this blocks readiness and could cause issues on rollbacks; consider a dedicated migration job

---

## Refactoring / Tech Debt

- [ ] **Short-poll → WebSocket or SSE** — the 5-second poll works but adds unnecessary load; evaluate Server-Sent Events for real-time item updates
- [ ] **API error handling in frontend** — most fetch calls lack granular error handling; add a unified error boundary or toast for network failures
- [ ] **Test coverage gaps** — backend tests use SQLite in-memory (good), but frontend test suite coverage is unknown; audit with `vitest --coverage`
- [ ] **Frequency suggestion dismissal TTL** — dismissals are stored in `localStorage` with a backend-computed TTL; verify the TTL logic handles timezone edge cases correctly
