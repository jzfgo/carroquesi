# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.15.0] — 2026-05-30

### Added
- Remove price entry from unpurchased items (#53)

- Offline support with stale-while-revalidate cache and write queue (#54)

- Redesign ReceiptScanSheet with unified row model and quantity support (#56)


### Fixed
- Correct receipt scan entry point and camera button description in CLAUDE.md

- Restore price logging on purchased items and history access on unpurchased


---
## [0.14.0] — 2026-05-28

### Added
- Add receipt parsers for 14 new Spanish supermarket chains

- Replace Cloud Vision OCR with Gemini AI receipt parsing (#52)


### Fixed
- Silence Workbox 'no route found' warning for backend API calls

- Repair receipt scanning with Firebase AI SDK fixes

- Move model and generationConfig into inCloudParams for hybrid inference

- Skip reCAPTCHA App Check init in dev to silence PAT errors

- Add image support and output language to on-device receipt scan session

- Set responseMimeType to application/json for structured AI receipt output

- Add json schema to on-device prompts

- Switch ai mode to prefer_in_cloud


---
## [0.13.0] — 2026-05-27

### Added
- Add receipt scanning implementation plan

- Receipt scanning (OCR bulk price logging) (#50)

- Show camera/gallery picker when scanning receipt on mobile


### Fixed
- Move receipt scan CTA inside ItemList scroll container

- Make FrequencySuggestionBanner visible via fixed bottom-panel wrapper

- Make PurchaseToast body opaque

- Render receipt-scan-cta before purchased section, not at end of scroll

- Resolve GCP credential errors and style ReceiptScanSheet

- Rewrite receipt parsers to handle Cloud Vision columnar OCR output


---
## [0.12.1] — 2026-05-26 — PWA asset fixes

### Fixed
- Replace favicon with spec-correct simplified silhouette

- Set monochrome icon purpose to 'monochrome maskable'

- Remove clip-rule attributes from monochrome SVG

- Set monochrome icon purpose back


---
## [0.12.0] — 2026-05-21 — Design system & mascot

### Added
- Add mascot asset and shared Mascot component

- Add mascot to sign-in screen

- Add mascot to list empty state

- Add mascot to dashboard empty state

- Add mascot to invite screen

- Replace placeholder icons with mascot

- Design system — composition notebook theme, new fonts, OS dark mode (#49)

- Replace index.css token block with design system tokens

- Load design system fonts and update theme-color

- Remove terminal theme system

- ThemeManager follows OS prefers-color-scheme, toggles theme-dark on body

- Remove SettingsScreen and theme switcher UI

- Add Wordmark component (Caveat + verde tick)

- Restyle SignInScreen — Wordmark, Caveat annotation, lifted CSS

- Restyle DashboardScreen with new tokens and Wordmark

- ListHeader title uses Bree Serif display font

- ProgressBar variant prop (primary=tinta, success=verde)

- Restyle ListCard with progress bar variant and new tokens

- ItemCard avatar uses self/other rule; price tag uses verde tokens

- Restyle CreateListCard with dashed border and display font

- FrequencySuggestionBanner — solid tinta add button, miel bg

- Restyle Toast, PurchaseToast, InstallBanner with new tokens

- Restyle SmartInputBar and FilterBar with new tokens

- Restyle all action sheets with shared chrome tokens

- Restyle BarcodeScanner overlay and reticle

- Update brand assets for new design system


### Changed
- Resize mascot PNG from 1024×1024 to 512×512 (940 KB → 265 KB)


### Fixed
- Filter bar visibility and search vs chip store behaviour (#48)

- Add og:image to invite share page for WhatsApp previews

- Add AuthContext mock to ItemList.test.tsx after ItemCard gained useAuth

- Replace fallback hex values with canonical tokens in ItemCard and ItemList CSS

- Remove stray closing parens in LogPriceSheet.css from sed token replacement

- Complete design system — brand assets and token cleanup


---
## [0.11.1] — 2026-04-26

---

## [0.11.0] — 2026-04-26 — Price history normalization

### Added

- Normalize mixed-unit price history to €/kg (#47)

### Fixed

- **frontend:** Ensure typecheck uses tsconfig.app.json (#46)

---

## [0.10.0] — 2026-04-24 — List filtering & quoted sigils

### Added

- `FilterBar` above the item list: chip mode (one chip per store, "Todas" resets) and search mode (slide-in text input with full sigil syntax) (#44)
- Quoted sigil values in `SmartInputBar` — spaces now allowed inside `#`/`@` values when wrapped in `"` or `'` (e.g. `@'Ahorramas express'`) (#43)

### Added

- Delete a logged price entry with a same-day guard: button only visible when `purchased_at` is today, backend enforces the same rule (422 otherwise) (#42)

---

## [0.9.0] — 2026-04-18 — Deep-linkable lists & store UX polish

### Added

- `/lists/:id` route so individual list screens are deep-linkable (#39)
- Last-used store pre-fill in `LogPriceSheet` persisted via `cqs_last_price_store` localStorage (1 h TTL) (#40)

### Fixed

- Dashboard list cards refresh silently when returning from a list (no flash) (#41)
- Deduplicate stores when the same `@` sigil appears multiple times (#38)

---

## [0.8.0] — 2026-04-10 — Own-brand inference & duplicate guard

### Added

- Auto-infer `@store` from ~50 Spanish supermarket own-brand names (e.g. `#Hacendado` → `@Mercadona`) via `lookupOwnBrandStore` (#35)
- Block adding a duplicate unpurchased item to the same list (#34)

### Added (infra)

- GitHub Actions CI pipeline (#33)

---

## [0.7.0] — 2026-04-07 — Cost totals & progress bar

### Added

- Running cost totals next to section labels: estimated total (accent) for unpurchased, daily spent (green) for purchased date groups; `≥` prefix when any item lacks a resolvable price (#31)
- `parseQuantityFactor` handles SI units (`g kg ml cl dl l`), count multipliers, and pack descriptors (#31)

### Fixed

- Progress bar scoped to the current shopping session, not all-time data (#30)
- Community price tooltip deduplicated; mobile ⓘ button interaction fixed (#29)

---

## [0.6.0] — 2026-04-03 — Inline price logging (`$` sigil)

### Added

- `$`/`€` sigil in `SmartInputBar` for logging a price at item creation; accepts comma/dot decimal and optional `/kg` suffix (#28)
- Price preview pill shown in input preview when a valid price is parsed (#28)

### Fixed

- Pause polling when tab is hidden; catch up on `visibilitychange` (#27)
- Add `User-Agent` header to Open Prices API requests; fix wrong response key (`items` not `results`) (#23, #24)
- Surface community price in `PriceHistorySheet` (#21)

---

## [0.5.0] — 2026-03-30 — Price tracking & barcode scanning

### Added

- Price tracking: community prices (Open Prices API), user-logged prices, price history grouped by store with SVG sparklines (#12)
- `LogPriceSheet` for manually recording prices; `PriceHistorySheet` with expanded chart + last/min/max stats (#12)
- Manual EAN input (`|` sigil, 8 or 13 digits); barcode lookup via OpenFoodFacts + local `barcode_cache` table (#20)
- `BarcodeScanSheet` pre-fills brand/store from lookup result (#20)
- Price fields moved onto `list_items` (dropped separate `price_records` table) (#15)

### Added (backend)

- `community_price.py` service with negative-cache for Open Prices API (#12)
- `barcode.py` router (`GET /barcode/{ean}`) (#20)
- `prices.py` router (`GET/POST/DELETE /lists/{id}/items/{item_id}/prices`) (#12, #42)

---

## [0.4.0] — 2026-03-25 — Purchased-item rules & frequency suggestions

### Added

- Purchase frequency auto-suggestions via `FrequencySuggestionBanner` — cycles every 6 s, dismissals in localStorage with backend-computed TTL (#11)
- Purchased items are read-only: rename/quantity/brand/store edits disabled; `ItemCard` renders tags as `<span>` for purchased items (#18)
- Prevent unchecking items after the calendar day changes (#17)
- Item list ordered by status/date; purchased items grouped by date (#16)

### Added (backend)

- `GET /lists/{id}/due-suggestions` endpoint (#11)
- `GET /lists/{id}/updated-at` polling endpoint (#11)

---

## [0.3.0] — 2026-03-20 — Theme system & settings

### Added

- 25 built-in themes (including Monokai Pro, Cobalt, Dracula) accessible from the user menu (#14)
- Settings screen with theme customization (#13)
- Price history grouped by item name + brand for manually added items (#13)

---

## [0.2.0] — 2026-03-10 — Invite system & core list UX

### Added

- `SmartInputBar` sigil system: `+` quantity, `#` brand, `@` store (multiple), parse preview (#parseInput)
- `ItemCard` with tag CTAs, `Toast` auto-dismiss, `ListHeader`, `ProgressBar` components
- Invite system: shareable UUID link, email-match enforcement, opt-in acceptance flow
- OG meta-tag preview page for invite links (`GET /i/{invite_id}`)
- Prefix-match autocomplete suggestions (`GET /lists/{id}/updated-at` + 5 s poll)

### Fixed

- Case-insensitive dedup in suggestions; stable sort order
- List owner cannot be removed; existing members cannot be re-invited

---

## [0.1.0] — 2026-02-28 — Foundation

### Added

- FastAPI backend with PostgreSQL (SQLModel + Alembic migrations)
- Firebase Auth integration — Google Sign-In; `get_current_user` / `require_member` / `require_owner` dependencies
- `POST /auth/sync` upsert endpoint
- Full lists, members, items, and invites CRUD
- React + TypeScript frontend (Vite + PWA via `vite-plugin-pwa`)
- Dev auth bypass (`DEV_AUTH_BYPASS` + `X-Dev-User-Id` header)
- Docker setup for backend; Firebase Hosting target for frontend
- In-memory SQLite test suite (no Postgres required)
