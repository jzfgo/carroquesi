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

20 label photos taken in Mercadona and Ahorramas (Madrid, Jun–Oct 2026). For
each label, the digits under the barcode were read and decoded by hand, then
checked against the printed text and against the GS1 mod-10 check digit.
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
  sticker also has a QR). The polyfill already
  supports both formats.
- **Discounts.** A marked-down tray has both labels: the white EAN-13 holds
  the original price, the yellow sticker the reduced €/kg and total. Example:
  entrecot 8,02 € → 7,22 € (−10 %); lamb chops 33,00 → 24,75 €/kg (−25 %).
- **Product identity without an EAN.** The article code is stable: `02791`
  is the same chicken breast on three trays, and `25258` appears on both the
  white and the yellow label of the same pack.
- It confirms the JAV-213 finding: the three chicken-breast trays had the
  same original price (10,00 €/kg). The price spread was weight.

## Limits

- These are private in-store formats, not a public standard. They differ by
  chain and can change without notice. Always validate the check digit and
  `weight × €/kg ≈ total`, and fall back to OCR when either fails.
- Two chains, 20 labels, one region. Other chains and other Mercadona
  sections (deli counter, bakery) are untested.
- The article code is per chain and maybe per region; do not use it across
  chains.

## Test vectors

`frontend/src/lib/weighedLabelVectors.json` holds every decoded label plus
two negative cases (a bad check digit and an ordinary EAN-13). Like
`storeKeyVectors.json`, it is meant to pin the frontend and backend decoders
to the same cases.
