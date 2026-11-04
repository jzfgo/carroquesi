# Spend-insight engine

**Date:** 2026-11-04
**Status:** Approved
**Issue:** JAV-216 (parent JAV-213, blocks JAV-217)

## Intent

One deterministic engine in the backend computes where a list's money went in
a month. Every surface only renders its output: the monthly email first
(JAV-213), the app later, then wrapped, MCP or an LLM. Two surfaces that each
compute their own totals would disagree; one engine cannot.

The app will show reports too, so the output is designed as an API contract
from day one, not as an email-internal format. Reports are computed **live**:
a receipt scanned late changes last month's in-app report. The email is a
snapshot of the day it was sent; the app is the current truth, the same way a
«≈» trip total turns into a confirmed one.

## Goals

- `compute_report(session, list_id, month, tz) -> SpendReport`: a typed,
  serialisable record of every v1 insight for one list and one calendar month.
- A script that runs it against a real list in a real database and prints the
  result, so the numbers can be checked before the email exists.
- One rule for "how much money a line is", shared by backend and frontend
  through a vector file, and the existing drift between them fixed.

## Non-goals

- No HTTP endpoint, no email, no scheduler, no persistence. The endpoint is the
  next step once the app has a screen for it; JAV-214/215 own email and runs.
- No "paid above your own best price" suggestion (decided out of v1).
- No product categories, external prices, budgets or estimates.
- No full coverage metric: JAV-217 builds it on top of this. The engine only
  carries the counts that metric needs.

## Anti-goals

- A suggestion that is wrong because a price gap is really a size gap. The
  tray/pack rule exists for this; when in doubt, suggest nothing. An empty
  "to save" block is the common case (0–3 a month on real data).
- A total that looks confirmed but is not. Any figure that falls back to line
  sums is flagged approximate.
- Fuzzy product or store matching (ADR-013).
- Any write. The engine and the script only read.

## Constraints

- Line money needs `parse_quantity_factor` on a free-text quantity, which SQL
  cannot do. This is why the stack's `items_total` is computed in Python.
- No list or owner stores a timezone, and a scheduled run has no
  `X-Client-Timezone`. JAV-215 says the period is cut in the owner's zone; the
  engine takes `tz` as a parameter and the caller decides.
- Data volume is small: hundreds of lines a month per list.
- Product identity is folded name + folded brand: EAN is on 1–5 % of lines.

## Approaches

**A. Load the window, compute in Python — chosen.** A few queries load the
list's purchases and purchased lines from the start of the trend window to the
end of the month, plus the store registry. Everything else runs in memory over
plain dataclasses, and the result is Pydantic models with a `type` field. Fits
the factor constraint, keeps every rule in one language, and the models drop
straight into OpenAPI when the endpoint arrives.

**B. SQL aggregates + Python.** Totals, by-store and by-requester as SQL
`GROUP BY`, savings in Python. Scales better, but splits "how much is a line"
across two languages, and the SQL half would be wrong for any line with a
quantity. Rejected.

**C. Persist computed insights.** Rejected with the "live" decision: nobody
would read the table, and JAV-215's `report_runs` already covers idempotent
sends.

## Decisions

Decided in conversation:

- Consumer for now is a script run against a real list.
- Period is a calendar month in a caller-given timezone; the script defaults
  to `Europe/Madrid`.
- Reports are live; no snapshot.
- Projected monthly saving uses the **average monthly quantity over the 90-day
  window**, not the reported month alone, so one heavy month does not inflate
  a suggestion.
- Savings thresholds are the ones recorded in JAV-216: 10 %, 1 €/month, 1
  observation per store, 90 days, 15 % spread.

### Line money (shared rule)

- A purchased line's amount is `price × parse_quantity_factor(q, price_per)`,
  where `q = purchased_quantity ?? quantity`. This is what the frontend's
  `computeCostSummary` already does. The stack's `items_total` in
  `routers/purchases.py` uses `quantity` only; it is fixed to match.
- A line's comparable unit price is the backend port of `normalizeEntries`'s
  per-entry step: `KILOGRAM` → `price` €/kg; otherwise, an SI quantity →
  `price ÷ kg_factor` €/kg; otherwise `price` €/unit. Unit prices are only
  compared on the same basis.
- `test_quantity.py`'s hand-written cases move to a shared
  `frontend/src/lib/quantityVectors.json` (the `storeKeyVectors.json` pattern),
  asserted by both suites, with cases for the factor and the unit price.

### Attribution

- A trip belongs to the month of its `opened_at` in `tz` (the trip's real day,
  as `tripDateLabel` reads it).
- A line's store is `price_store ?? trip.store`, grouped by `store_key` and
  labelled with the registry display name, raw string as fallback.
- A trip's money is `total` when confirmed, else its line sum, flagged
  approximate. Spend by store uses trip money under the trip's store.
- Spend by requester and by product use line money only, so they can fall short
  of the total; each carries priced/total line counts for JAV-217.

### Insights in v1

Each is a record with `type`, `period`, `list_id`, its value fields, and the
line/trip counts behind it.

- **totals** — month total (+ approximate flag), trip count, delta vs previous
  month and vs the average of the three before, and a five-month series ending
  at the month.
- **by_store** — money and trip count per store key.
- **top_products** — products by money in the month, each with its delta vs
  its own three-month average and a `new` flag when not bought in those three
  months. This is what explains a change ("94 € from 5 meat/fish products, 3
  new").
- **by_requester** — line money per `added_by` user, named from `users` even
  when they have since left the list.
- **cadence** — trips in the month and mean days between them.
- **cheaper_elsewhere** — see below; at most 5, best projected saving first.

- "The three months before" averages only months since the list's first trip,
  so a new list is not compared against empty months. A month with no trips
  after that counts as 0.

### Cheaper at another chain

All observations come from **this list only** (per-list scope, JAV-213). For
each (product, store A) pair bought in the month — a product bought at two
stores is evaluated once per store:

1. `pA` = the mean of its unit prices at A in the month (one per line).
2. For every other store key B with ≥ 1 priced observation of the product in
   the 90 days ending at month end, on the same basis: `pB` = the **most
   recent** observation at B, with its date (the email prints "lo pagaste a
   1,05 € el 12/10").
3. Keep B where `(pA − pB) / pA ≥ 10 %`, then pick the lowest `pB`.
4. Projected €/month = `(pA − pB) × mean monthly quantity` of the product in
   the 90-day window, at any store. A line's quantity in the basis unit (kg or
   units) is `line money ÷ unit price`; the monthly mean is the window's sum ×
   30 / 90. Keep if ≥ 1 €.
5. Tray/pack rule: on the €/unit basis, skip unless the product's unit prices
   vary by ≤ 15 % across the window **at both A and B**. One price at B
   cannot spread, so the check at A, where the list buys most often, is what
   catches a fixed-price tray. €/kg lines always pass. Accepted gap: a tray
   bought once at each store still passes until JAV-222 records its weight.

Thresholds live in a frozen dataclass with these defaults; the script can
override each one by flag.

## Shape in the code

- `app/services/insights/` — `engine.py` (`compute_report`), `savings.py`,
  `schemas.py` (the Pydantic records), and the line helpers alongside
  `services/quantity.py`.
- `scripts/spend_report.py --list <id> --month YYYY-MM [--tz] [--json]
  [--min-saving-pct …]`, using `DATABASE_URL` like `manage_feature.py`. Text
  output by default for reading; `--json` dumps the `SpendReport`.

## Left to the builder

- Exact Pydantic field names and the discriminated-union layout.
- Query shape, as long as it is a bounded number of queries per report.
- How the text output of the script is laid out.
- How purchased lines with no trip (`purchase_id` NULL, legacy) are handled;
  the default is to leave them out of money and count them in coverage.

## Known limits

- Unbranded products match on name alone across chains («leche» at two
  chains may be two products). Accepted for v1; own brands never cross chains
  because their brand differs.
- Misdated purchases from JAV-219 land in the wrong month until that backfill.
- Packs stay excluded in practice by the spread rule until JAV-12.
