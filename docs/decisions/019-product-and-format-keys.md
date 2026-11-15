# ADR-019: Name and brand name the product; the EAN names the format

**Status:** Accepted
**Date:** 2026-11-15

## Context

A product comes in formats: a 1,5 L bottle, a pack of 6 × 1,5 L, a 5 L
jug. Each format has its own EAN. Until now the price history grouped by EAN
when the item had one, and by name + brand otherwise. So a scanned item only
saw its own format, and was split from the same product typed by hand.

Lines now carry a pack format (`pack_count`, `pack_content`,
`pack_content_unit`), and prices are compared per kg, per L or per unit of
a pack, like a shelf label. That only helps if one history holds all the
formats. Grouping by EAN works against it.

## Decision

A line carries two keys, with different jobs.

**Name and brand name the product.** The price history and the spend
insights group by them, always, never by EAN. One history spans every
format, and prices are put on one basis (kg, L or ud of a pack). An entry
on another basis, or with no format, keeps its own price and stays out of
the minimum and the curve. Kilos and litres are never mixed.

**The EAN names the format.** What belongs to the format still keys on the
EAN first (`bought_by_weight`). Scanning an EAN resolves to name, brand and
format. Re-buy keeps the line's EAN and format: the usual case is the same
format again. Changing the format by hand clears the line's EAN, because
that EAN named the old format; a scan in the same request sets the new one.
A missing EAN only costs a lookup; a wrong one would teach the barcode the
wrong format.

**The pending-duplicate guard stays at name level.** One product, one
pending line, whatever the format. The pending list says what to buy, not
which format.

## Considered

- **Keep grouping by EAN.** Each format keeps a clean history, but the
  household never sees that the 5 L jug is cheaper per litre, which is the
  point of normalising.
- **A product entity with formats under it.** The right model in the long
  run, but a large change to every write path. Tracked separately.

## Consequences

- Exact name matching is the weak point, as it already was for unscanned
  items: two spellings split a history. [ADR-013](013-store-registry.md)
  takes the same stance for stores (deterministic keys, no fuzzy merges),
  for the same reason: a wrong merge silently fuses price histories.
- An EAN shared by two names no longer joins their histories.
