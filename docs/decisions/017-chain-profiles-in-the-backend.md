# ADR-017: Chain profiles live in the backend

**Status:** Accepted
**Date:** 2026-11-04

## Context

Some features need to know one supermarket chain's rules, and the list keeps
growing:

- **Own brands.** `frontend/src/lib/ownBrands.ts` maps 63 own brands across
  13 chains to their chain ("Hacendado" → Mercadona), so setting the brand adds the store.
  It lives only in the frontend, and names the chain as display text rather
  than by `store_key`.
- **In-store barcodes.** Weighed-goods labels encode weight, price per kg and
  total in private, per-chain layouts. Mercadona uses a 24-digit label with
  prefix `23`; Ahorramas uses an EAN-13 with prefix `21` that holds the price
  only. The `20`–`29` prefix range is reserved for in-store use, and each chain
  fills it its own way. See the spike
  [2026-11-04-variable-weight-barcodes](../spikes/2026-11-04-variable-weight-barcodes.md).
- **Coming next:** markdown labels (JAV-221) and hints for reading label photos
  (JAV-220).

Spread across files, this knowledge drifts, and adding a chain means hunting
for every place that knows one.

There were two honest ways to share it between frontend and backend:

- **Twin implementations,** like `storeKey`: one copy per side, pinned to a
  shared vector file. Every chain change touches two codebases and two deploys.
- **Backend only.** The frontend holds no chain logic. It sends what it reads
  (the raw barcode digits) and shows the answer, and it receives static chain
  data as data.

## Decision

**One profile per chain, in the backend.** A `backend/app/chains/` package
holds a registry and one folder per chain:

```
backend/app/chains/
  registry.py      # store_key → profile; a generic profile when none matches
  base.py          # the ChainProfile interface
  mercadona/
    profile.py     # store keys, own brands, label decoders
    vectors.json   # decoder test cases
```

A profile carries data where it can (store keys, store name, own brands)
and code where it must (barcode decoders), each decoder pinned to its own
vector file. Adding a chain means adding a folder.

The profile's store name is only the raw string a chain feature writes onto
an item, such as the store the own-brand rule adds. It goes through
`ensure_stores` like any typed store, so the first typed form still seeds the
registry label, and it never overrides `list_stores.display_name`.

**The frontend receives data, not logic.** Barcode decoding happens on the
server: the scanner sends the digits, the backend answers with the decoded
fields or a rejection. The own-brand table is served by a cacheable
`GET /chains` endpoint; the frontend looks brands up in that table as it does
today, but no longer owns it. The lookup is a table read, not a rule, so it
does not reintroduce a twin implementation.

**Why backend only costs nothing here.** Every chain feature on the table ends
in a write: adding an item, recording a price, a weight or a markdown. Offline
is read-only ([ADR-011](011-offline-is-read-only.md)), so those features need
the server anyway. Some need chain knowledge _before_ the write: the own-brand
chip appears while the user types, and label-photo hints (JAV-220) are needed
on the client if photos are parsed there, as receipts are
([ADR-004](004-gemini-via-firebase-ai-sdk-for-receipt-scanning.md)). Those get
it as data from `GET /chains`, never as logic. A chain feature that needs logic
on the client would reopen this decision.

**Decoders take the chain as a hint.** Prefix `23` means one thing at
Mercadona and may mean another elsewhere. The hint is the one store the scan
is tied to: the store of the trip being reconciled, or the store group the
user scanned from. When there is no such store, or more than one, there is no
hint. Without a hint, a code is accepted only when exactly one decoder
validates it, including its check digit and its arithmetic.

**Profiles do not merge stores.** A profile may list several store keys
(`bm`, `bmsupermercados`) so chain features apply to both. That grouping is
for chain features only. It never merges price histories or display names:
both stay per key and per list, as [ADR-013](013-store-registry.md) decided.
ADR-013 rejected a curated chain list as the source of display names; this
ADR does not revisit that.

## Alternatives considered

- **Twin implementations** — rejected: two codebases to change per chain, for
  no gain, since every caller is online already.
- **Keep chain rules where each feature needs them** — rejected: the knowledge
  is already split between the frontend (own brands) and the planned backend
  decoders, and it drifts.
- **Chain data in the database** — rejected for now: profiles change with code
  (decoders) and ship with releases. Self-hosters add a chain through the same
  folder. Revisit if households need to define their own chains.

## Consequences

Implementation is tracked in JAV-223; the first decoder user is JAV-222.

- One place to add or fix a chain. After the first move, a chain change
  deploys only the backend; the move itself also ships a frontend change.
- `ownBrands.ts` moves into the profiles; the frontend fetches the table and
  caches it. So the chip works on a cold start, before the first fetch
  answers, the frontend ships a generated snapshot of the table as a fallback.
  It is regenerated from the backend like the API types, never edited by hand.
- In-store labels need a new scan path. Today `|EAN` accepts only 8 or 13
  digits and `GET /barcode/{ean}` is the only scan endpoint, so a 24-digit
  label needs its own input path and a decode endpoint, not just a decoder.
- Barcode scans of in-store labels need the network, like every other write.
- A chain the registry does not know gets the generic profile: no own brands,
  no in-store decoders. Ordinary EAN lookups are unaffected.
