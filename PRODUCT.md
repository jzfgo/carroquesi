# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are **members of a household who share the grocery shopping** — typically a couple or a family, at least one of whom is not technical and will never read documentation. They are usually on a phone: one adding items at home during the week, another walking the aisles of a supermarket with a cart in one hand, variable connectivity, and no patience for setup.

The maintainer's own household is the reference user group. Access is currently gated by an early-access waitlist plus per-list invitations, so every user today arrived either through the waitlist or because an existing member invited them.

Secondary audience: **readers of the maintainer's writeups.** The project doubles as public material about how it was built (see Product Purpose), so the developer-facing artifacts — ADRs, changelog, README, the Siri Shortcuts integration — have an audience of their own.

There is one privileged role, `is_admin`, carried as a Firebase custom claim rather than stored in the database. It gates administrative endpoints; it is not a user tier.

## Product Purpose

CarroQueSí is a collaborative grocery list. A household keeps one or more shared lists; anyone can add items, anyone can mark them purchased, and everyone sees the change within seconds. On top of that base it remembers: what the household rebuys and when it is due again, what each item cost, and where.

**The honest statement of what this project is:** its primary deliverable is *craft and the writing that comes out of it* — shipping quality, the engineering decisions, and the public writeups (Siri Shortcuts, receipt AI, the sync model). Real users exist and are served properly, but user growth is not the success metric.

That does not soften the design bar; it sets it. The measure of the craft is whether a non-technical family member succeeds with the app **unaided**. A feature only the maintainer would use is feature creep, not a feature — this test was applied explicitly in 2026-07 to keep Siri Shortcuts and to drop MCP integration from tracked goals. Design work is judged against that bar, not against a demo.

## Positioning

Four things together, none of which a generic shared-list app could truthfully claim:

1. **Price memory built from real receipts.** Scan a supermarket receipt, an AI pass parses the lines, the backend fuzzy-matches them to list items, and after review the prices land on the items. From then on each item carries a price history, and a shopping session shows a running cost total. The list becomes the household's own price record — not a store's, not a comparison site's.
2. **A list that partly writes itself.** Purchase history produces product suggestions and "due again" prompts, so the weekly list is not rebuilt from zero.
3. **Built for a household, not a power user.** Google Sign-In, share a link, done. No workspaces, no roles to configure, no onboarding to read.
4. **Designed for the aisle, not the desk.** Installable PWA, offline write queue that replays on reconnect, barcode scanning, and push notifications — for a phone held one-handed in a supermarket with poor signal.

The receipt→price loop is the sharpest of the four: it is the only one that produces data the household could not get anywhere else.

## Operating Context

- **Two distinct moments.** *Composing* (at home, calm, adding and tidying items) and *shopping* (in-store, one hand, moving, glancing). The same screens serve both; the in-store moment is the harsher constraint and wins ties.
- **Two-device concurrency is the normal case, not an edge case.** Two people in the same list at the same time — one at home adding, one in the store checking off — is the situation the product exists for. State changes between any two interactions.
- **Sync is short-polling**, every 5 seconds against a list timestamp, with a re-fetch only on change ([ADR-001](docs/decisions/001-short-polling-for-list-sync.md)). Web Push complements it — polling keeps an *open* app fresh, push reaches a *closed* one — and is best-effort: unavailable on iOS without a home-screen install, so it can never be relied on as a sync mechanism ([ADR-010](docs/decisions/010-web-push-via-fcm.md)).
- **Connectivity is unreliable by assumption.** Item writes go through an IndexedDB offline queue and replay on reconnect; they never hit the API directly.
- **The receipt is a physical artifact** photographed under supermarket or kitchen lighting — crumpled, thermal-printed, sometimes truncated. Parsing is imperfect by nature, which is why a human review step sits between the AI parse and the applied prices.
- **Stores are named, not enumerated.** Prices are logged against free-text store names (the seed data uses Carrefour, Lidl, Dia, and El Corte Inglés; users type whatever they shop at), and per-store name mappings are learned from receipts over time.

## Capabilities and Constraints

Confirmed and shipped:

- Multiple shared lists per user; membership by explicit, opt-in invitation — access is granted only after the invite is accepted.
- Items with quantity, brand, store, tags, and barcode; a purchased state that records *when*, *how much* was actually bought, and at what price.
- Purchased items are largely read-only. Price deletion carries a same-day guard, enforced on both the client and the server.
- Smart Input bar with a sigil syntax (`+qty`, `#brand`, `@store`, `|EAN`) for fast entry, alongside plain typing.
- Suggestions from purchase history, and due-again prompts.
- Barcode lookup with caching; community price lookup by EAN, with misses negative-cached.
- Receipt scanning: client-side parse via Gemini → backend fuzzy match → user review → apply. Behind a feature flag, default off.
- Web Push via FCM, on item add and on first purchase only. Un-purchasing is a correction and stays silent. Enabled by default; token presence *is* the on/off state.
- Each member has at most one default list, set explicitly, never inferred — the target of the Siri Shortcuts `"default"` resolver ([ADR-007](docs/decisions/007-per-user-default-list.md)).
- Non-browser access (Siri Shortcuts) via a static per-user API key, stored hashed ([ADR-006](docs/decisions/006-api-key-auth-for-non-browser-clients.md)).
- In-app feedback submission; early-access waitlist with per-email approval.
- Per-user feature flags from a server-side registry.

Constraints future work must respect:

- **Google Sign-In via Firebase Auth is the only human sign-in path.** No passwords, no email/password fallback, no other providers today.
- **Firebase is a dependency, not a deployment choice** — the backend validates Firebase ID tokens ([ADR-002](docs/decisions/002-firebase-auth-only-postgres-for-data.md)). Everything else (static host, container runtime, Postgres host) is swappable; the backend's entire contract with the database is `DATABASE_URL`.
- **No Firestore.** All CRUD goes through the FastAPI backend.
- Submitting prices to Open Prices is explicitly **out of scope** (it requires a proof image and an OSM location).

Terminology, as the product uses it:

- **List** — a shared shopping list. **Member** — someone with accepted access to a list. **Item** — a line on the list. **Purchased** — an item bought on this trip, with a timestamp. **Due** — something the history suggests is worth rebuying. **Store** — a free-text shop name attached to a price. **Session total** — the running cost of the current trip.

Open, deliberately undecided:

- **Language.** The interface is Spanish today, and Spanish is the language of the current users — but this is the present default, not a fixed audience decision. Internationalization is considered likely later. Design and copy work should therefore avoid baking in Spanish-shaped assumptions (fixed label widths, string concatenation, Spain-only price or date formatting), while continuing to ship Spanish copy. The README and all developer-facing documentation are in English; that split is intentional and stays.
- **Monetization.** Nothing today and nothing planned short-term, but it is an open aspiration rather than a ruled-out option. Two things would open the decision: the app delivering enough value to justify asking for money, or running costs becoming material — the AI features are the cost that scales with usage, so they are the likely forcing function. Two consequences for design work, and they pull in different directions: (a) never show, imply, or invent a price, plan, tier, trial, or upgrade path — none exists; (b) do not design as though per-use cost were zero. Anything with a marginal cost per invocation should stay a deliberate user action, not something the interface fires automatically, repeatedly, or on speculation.

## Brand Commitments

- **Name:** CarroQueSí. Always with the accent and the internal capitals. Spanish wordplay on *carro* (shopping cart) — roughly "cart, yes". A `Wordmark` component owns its rendering; it is not set as plain text.
- **Mascot:** a shopping-cart character (`frontend/src/assets/mascot.png`, plus a `Mascot` component) used on entry screens and in the README. It is part of the identity, not decoration to be dropped.
- **Taglines in use:** *"Together we shop better"* (English, README) and *"Lista de la compra compartida. Sencilla. Para toda la familia."* (in-app). Both are existing copy — do not replace them with invented alternatives without asking.
- **Voice:** warm, informal, second-person, Spanish. Short encouraging asides appear alongside headings ("¡a por ello!", "¡bienvenid@!"), and inclusive forms like `bienvenid@` are used deliberately. Errors stay plain and blame-free ("Algo fue mal, inténtalo de nuevo."). No corporate register, no exclamation-stacking, no cuteness that gets in the way of a task.
- **Licence:** AGPL v3. Public repository at `github.com/jzfgo/carroquesi`.

## Evidence on Hand

Real assets that exist and may be used:

- Mascot artwork (`frontend/src/assets/mascot.png`) and the full PWA icon set (`frontend/public/`: favicon, maskable, monochrome, apple-touch, OG image).
- A realistic seed dataset: 3 users, 4 lists, 128 items with price history across 6 stores (`just seed`) — usable for populated states and screenshots.
- Ten Architecture Decision Records in `docs/decisions/`, a maintained `CHANGELOG.md`, and a versioned release history.
- A working dev auth bypass for capturing real UI without Google Sign-In.

Absences future work must **not** fabricate:

- No testimonials, quotes, reviews, or named customers.
- No user counts, engagement metrics, growth numbers, or benchmarks.
- No press coverage, awards, or partner logos.
- No pricing, plans, SLA, or enterprise claims.
- No supermarket brand endorsement — store names appear only as user-entered data.

## Product Principles

1. **The aisle wins the tie.** When the calm at-home moment and the one-handed in-store moment want different things, design for the store. It is the harder scene and the one the product exists for.
2. **Assume two people and a changing list.** Anything that only holds for a single user, a stable snapshot, an empty list, or a short one is not finished. Concurrency and unreliable connectivity are the normal case, not edge cases.
3. **Never lose a write.** Offline queueing is the contract, not an optimization. A path that bypasses it silently drops the user's work.
4. **The craft bar is a non-technical household succeeding unaided.** Nothing ships whose value requires the maintainer to explain it. If only a developer would use it, it is feature creep.
5. **Earned data, honestly shown.** Prices, history, and suggestions come from what the household actually bought. Never present inferred or fabricated numbers as recorded ones, and keep imperfect AI output behind human review.

## Accessibility & Inclusion

No formal conformance target has been set — record that as an open decision rather than assuming one. Two product-specific requirements are confirmed:

- **Non-technical members must succeed unaided.** This is the project's stated quality bar, and it applies to affordance clarity and copy as much as to features.
- **One-handed phone use under real supermarket conditions** — moving, mixed lighting, cart occupied — is the design scene. Touch target size, reach, contrast in bright light, and error tolerance follow from it, not from a desktop-first assumption.
