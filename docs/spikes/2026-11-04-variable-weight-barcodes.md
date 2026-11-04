# Spike: variable-weight barcodes on in-store labels

**Date:** 2026-11-04 · **Status:** done · **Verdict:** worth using. Mercadona's
weighed-goods labels carry weight, price per kg and total inside the barcode,
so a scan gives them without AI. Implementation is ticketed in
[JAV-220](https://linear.app/jzfgo/issue/JAV-220); discounts in
[JAV-221](https://linear.app/jzfgo/issue/JAV-221).

## Why

Prices of variable-weight trays (meat, fish, cut fruit) cannot be compared
per unit: a tray weighs differently each time. The September 2026 spend-report
test ([JAV-213](https://linear.app/jzfgo/issue/JAV-213)) suggested savings on
two such trays that turned out to be weight differences, not price
differences. Receipts rarely print the weight. The label always does.

## Method

20 label photos taken in Mercadona and Ahorramas (Madrid, Jun–Oct 2026). They
show 19 readable barcodes: two Ahorramas photos have no barcode in frame, and
on most marked-down trays the yellow sticker hides the white label's barcode.
For each barcode, the digits printed under it were read and decoded by hand,
then checked against the printed text and against the GS1 mod-10 check digit.
Figures not in any barcode, such as the original price on a white label whose
barcode is hidden, come from the printed text and are marked as such below.
The photos are kept off this public repo; they are attached to JAV-220.

## Findings

### Mercadona, 24-digit labels

Used on cut fruit (white label) and on the yellow "Bajada de precio"
(near-expiry markdown) sticker.

```
23 | 1 | 02791 | 00636 | 00900 | 00572 | 1
   |   |       |       |       |       └ check digit (GS1 mod-10 over the first 23)
   |   |       |       |       └ total, cents        → 5,72 €
   |   |       |       └ price per kg, cents         → 9,00 €/kg
   |   |       └ net weight, grams                   → 0,636 kg
   |   └ article code, 5 digits (same as the EAN-13 below)
   └ 0 = normal price, 1 = marked down
```

All 16 labels decode correctly. In every case the check digit is valid,
`weight × price per kg` rounds to the total, and the values match the text.

### EAN-13 with an embedded price

| Store                        | Example            | Layout                                    |
| ---------------------------- | ------------------ | ----------------------------------------- |
| Mercadona (white meat label) | `23 02712 00940 0` | prefix · article · price in cents · check |
| Ahorramas                    | `21 25178 00385 6` | prefix · article · price in cents · check |

These carry the price only. The weight is on the printed text, so it needs OCR.

### What this unlocks

- **Tray weight without AI** in Mercadona: one barcode scan gives weight,
  €/kg and total. The scanner only reads EAN-8 and EAN-13 today; the 24-digit
  label is most likely Code 128, not yet confirmed with a scanner (the yellow
  sticker also has a QR). The polyfill already supports both formats.
- **Discounts.** A marked-down tray carries both labels: the white EAN-13
  holds the original price, the yellow sticker the reduced €/kg and total.
  Example from barcodes alone: article `02712`, 9,40 € → 7,52 € (−20 %).
  Examples from the printed text: entrecot 8,02 € → 7,22 € (−10 %); lamb
  chops 33,00 → 24,75 €/kg (−25 %). The original price must come from the
  same pack's white label, never from an earlier purchase of the article:
  see `25258` below.
- **Product identity without an EAN.** The article code is stable. `02791`
  is the same chicken breast on three trays. `25258` is the same boneless
  thigh on two packs four months apart: a June white label (0,312 kg,
  9,00 €/kg, 2,81 €) and an October yellow sticker (0,346 kg, 8,82 €/kg,
  3,05 €). The October pack's own white label, read from the printed text,
  says 9,80 €/kg and 3,39 €, so the list price rose between the two. Read
  across packs, the two barcodes would show a "markdown" dearer than the
  original.
- It confirms the JAV-213 finding: the three chicken-breast trays had the
  same original price, 10,00 €/kg (printed text). The price spread was weight.

## Limits

- These are private in-store formats, not a public standard. They differ by
  chain and can change without notice. Always validate the check digit and
  the total, and fall back to OCR when either fails. The total check can be
  strict: `round_half_up(weight_g × price_per_kg_cents / 1000) == total_cents`
  holds exactly for all 16 real labels.
- Two chains, 19 barcodes, one region. Other chains and other Mercadona
  sections (deli counter, bakery) are untested.
- The article code is per chain and maybe per region; do not use it across
  chains.

## Test vectors

The 19 decoded barcodes live with the decoders, one file per chain:
`backend/app/chains/mercadona/vectors.json` and
`backend/app/chains/ahorramas/vectors.json`
([ADR-017](../decisions/017-chain-profiles-in-the-backend.md)). The Mercadona
file also holds four negative cases, each expecting `null`:

- a bad check digit;
- a valid check digit with a total that disagrees with weight × €/kg;
- a wrong length (23 digits);
- an ordinary EAN-13 outside the in-store prefix range.

Real entries carry `label`; negative entries carry `note` instead.
