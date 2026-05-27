# Receipt Parsing Migration: Firebase AI Logic (Gemini)

**Date:** 2026-05-27
**Status:** Approved

## Overview

Replace the current Cloud Vision OCR + per-chain regex parser pipeline with a frontend-driven Gemini call via Firebase AI Logic. The backend becomes a thin matcher-only endpoint. Firebase Storage is dropped entirely.

## Motivation

- The 14-chain regex parser (`receipt_parser.py`, ~50 KB) is brittle and hard to extend.
- Cloud Vision produces raw text that still requires chain-specific parsing logic.
- Gemini can extract structured receipt data in one call, handling all chains uniformly.
- Using Firebase AI Logic (`GoogleAIBackend` + `PREFER_ON_DEVICE`) enables on-device inference on supported Chrome/device platforms, improving latency and privacy.
- The current implementation does not correctly identify price types (unit, by-weight, multi-item); Gemini will handle this via structured output.

## Data Flow

```
User picks file (image or PDF)
  → frontend reads file as base64 inline data
  → frontend calls Gemini (gemini-3.5-flash, PREFER_ON_DEVICE)
      with structured-output schema → ParsedReceipt JSON
  → frontend POST /lists/{id}/receipt  { store, receipt_date, receipt_total, lines[] }
  → backend: receipt_matcher.match_lines() → matched / unmatched
  → backend: create ReceiptScan record → return ReceiptScanResult
  → ReceiptScanSheet (user verifies, confirms)
  → POST /lists/{id}/receipt-prices (unchanged)
```

## Price Type Model

The central improvement over the current implementation. Every receipt line is classified into one of three types:

| Type | Example receipt line | `unit_price` | `quantity` | `line_total` |
|------|---------------------|--------------|------------|--------------|
| `UNIT` | `Leche entera 0,89€` | 0.89 | null | 0.89 |
| `KILOGRAM` | `Plátanos 0,453kg × 1,99€/kg` | 1.99 (€/kg) | 0.453 | 0.90 |
| `MULTI` | `3x Yogur Danone 2,85€` | 0.95 | 3 | 2.85 |

- `unit_price`: what gets stored on the list item (`price` field). For `KILOGRAM`, this is the per-kg price. For `MULTI`, this is `line_total / quantity`.
- `quantity`: kg weight for `KILOGRAM`, item count for `MULTI`, null for `UNIT`.
- `line_total`: what was charged on the receipt — shown in `ReceiptScanSheet` for user verification.

When applying prices (`PricePatch`): `price = unit_price`, `price_per = "KILOGRAM"` only for `KILOGRAM` type, null otherwise.

## Frontend Changes

### `frontend/src/lib/firebase.ts`
Add `getAI` export alongside the existing `auth`:
```ts
import { getAI, GoogleAIBackend } from 'firebase/ai'
export const ai = getAI(app, { backend: new GoogleAIBackend() })
```

### `frontend/src/lib/receiptAi.ts` (new)
Single responsibility: call Gemini and return parsed receipt.

- Converts the `File` to base64 `inlineData` (works for both images and PDFs, required for `PREFER_ON_DEVICE`)
- Calls `getGenerativeModel(ai, { model: "gemini-3.5-flash", mode: InferenceMode.PREFER_ON_DEVICE })`
- Uses `generateContent` with a structured-output JSON schema (see below)
- Returns `ParsedReceipt`: `{ store, receipt_date, receipt_total, lines: ParsedLine[] }`

### Gemini Structured Output Schema

```json
{
  "type": "object",
  "properties": {
    "store": { "type": "string", "nullable": true },
    "receipt_date": { "type": "string", "nullable": true, "description": "ISO date YYYY-MM-DD" },
    "receipt_total": { "type": "number", "nullable": true },
    "lines": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "price_type": { "type": "string", "enum": ["UNIT", "KILOGRAM", "MULTI"] },
          "unit_price": { "type": "number" },
          "quantity": { "type": "number", "nullable": true },
          "line_total": { "type": "number" }
        },
        "required": ["name", "price_type", "unit_price", "line_total"]
      }
    }
  },
  "required": ["lines"]
}
```

Prompt instructs Gemini to:
- Skip non-product lines (subtotals, taxes, loyalty points, store address, cashier ID)
- For `KILOGRAM`: `unit_price` = price per kg; `quantity` = weight in kg
- For `MULTI`: `unit_price` = `line_total / quantity`; `quantity` = number of units
- Normalise item names to Spanish title case (strip receipt abbreviations where obvious)
- **Prefer null over guessing** (see section below)

### Hallucination Prevention (Critical)

The model must never infer, guess, or complete data that is not clearly legible in the image. Stains, folds, low contrast, or partial occlusion are common on receipts and must not be filled in from training knowledge.

Rules enforced in the prompt:
- `store`: return `null` if the store name is not clearly visible in the receipt header. Do not infer the store from product names or logo shapes.
- `receipt_date`: return `null` if the date is not fully legible.
- `receipt_total`: return `null` if the total line is not clearly readable.
- **Line items**: omit a line entirely if either the item name or the price is not clearly legible. Do not guess a price from a partially visible number. Do not complete an obscured product name.
- Do not use prior knowledge of a store's product catalogue to fill in missing characters.

The prompt will include an explicit instruction such as:

> "If any value is unclear, partially obscured, or you are not fully confident, return null for that field or omit the line entirely. Do not guess or infer values from context. Accuracy is more important than completeness."

### `frontend/src/lib/api.ts`
Replace `uploadReceipt` (multipart form) with `submitParsedReceipt` (JSON POST).

### `frontend/src/components/ListScreen.tsx`
`handleFileChange` replaces the `uploadReceipt()` call with:
1. `parseReceiptWithAi(file)` → `ParsedReceipt`
2. `submitParsedReceipt(getToken, listId, parsedReceipt)` → `ReceiptScanResult`

Accept both image types and PDFs in the file input (`accept="image/*,application/pdf"`).

### `frontend/src/components/ReceiptScanSheet.tsx`
Add a price context line below each item showing raw receipt data:
- `UNIT`: `0,89 €` (same as today)
- `KILOGRAM`: `0,453 kg × 1,99 €/kg`
- `MULTI`: `3 × 0,95 €`

### `frontend/src/types/receipt.ts`
Extend `MatchedLine` and `UnmatchedLine` with `price_type`, `quantity`, `line_total`.

## Backend Changes

### `POST /lists/{id}/receipt`

**Before:** multipart `UploadFile`, calls OCR + parser internally.

**After:** JSON body:
```python
class ParsedLine(BaseModel):
    name: str
    price_type: Literal["UNIT", "KILOGRAM", "MULTI"]
    unit_price: float
    quantity: Optional[float] = None
    line_total: float

class ReceiptScanRequest(BaseModel):
    store: Optional[str] = None
    receipt_date: Optional[str] = None
    receipt_total: Optional[float] = None
    lines: list[ParsedLine]
```

The endpoint passes `lines` to `match_lines()` (unchanged), creates a `ReceiptScan` record, and returns `ReceiptScanResult` (same shape as today, extended with `price_type`/`quantity`/`line_total` on each line).

`ReceiptScan.ocr_raw` and `ReceiptScan.image_path` columns remain in the DB (nullable, existing rows untouched) but are no longer written by the new endpoint.

### `POST /lists/{id}/receipt-prices`
No changes.

### `receipt_matcher.py`
Logic unchanged. The only edit: replace the import of `ParsedReceipt` from the deleted `receipt_parser` module with the new Pydantic `ParsedLine` from `app.schemas.receipt`. `match_lines()` signature adapts accordingly.

## Dead Code Removed

| File | Reason |
|------|--------|
| `backend/app/services/receipt_ocr.py` | Replaced by Gemini |
| `backend/app/services/receipt_parser.py` | Replaced by Gemini |
| `backend/app/services/image_storage.py` | Firebase Storage dropped |
| `backend/tests/fixtures/receipts/` | Parser test fixtures, no longer needed |
| `receipt_storage_bucket` config field | Firebase Storage dropped |
| `gcp_project` config field | No longer used |
| `google-cloud-vision` dependency | Replaced by Gemini |
| `google-cloud-storage` dependency | Firebase Storage dropped |

## Dependencies Added

### Frontend
- `firebase/ai` — already available in `firebase@^12` (no new package needed)

### Backend
None. The Gemini call moves entirely to the frontend.

## What Is Not Changing

- `receipt_matcher.py` — fuzzy matching + learned `ReceiptNameMapping` table
- `POST /lists/{id}/receipt-prices` — apply prices endpoint
- `ReceiptScanSheet` layout and confirmation flow (price display rows added, structure unchanged)
- `ReceiptScan` DB table schema (columns stay, two columns go unwritten)
- `ReceiptNameMapping` DB table and learning logic

## Open Questions

None — all design decisions resolved.
