import type { components } from './apiSchema.generated'

type S = components['schemas']

/**
 * API types are aliases over the OpenAPI-generated schema, so a backend shape
 * change fails typecheck here instead of drifting silently. Regenerate with
 * `just openapi`. The names predate the generator and are kept to avoid
 * import churn.
 *
 * A pydantic field with a default is "not required" in OpenAPI, so it comes
 * out optional (`?`). For a response model that is a fiction — FastAPI always
 * serializes every field — so response aliases wrap in `Required<>` to keep
 * `undefined` out of consumer code. Request aliases stay as generated:
 * an optional field there really can be omitted.
 */

// Responses
export type ListItem = S['ItemRead']
export type ApiList = S['ListRead']
export type BackendMember = S['MemberRead']
export type UserMe = Required<S['UserRead']>
export type ListStoreEntry = S['StoreRead']
export type Suggestion = S['SuggestionRead']
export type DueSuggestion = S['DueSuggestionRead']
export type BarcodeRead = Required<S['BarcodeRead']>
export type PriceEntry = Required<S['PriceEntry']>
export type PriceHistoryResponse = Required<
  Omit<S['PriceHistoryResponse'], 'entries'>
> & { entries: PriceEntry[] }
export type ListUpdatedAt = S['ListUpdatedAtRead']
// A shopping trip. Nullable fields (closed_at/store/total) stay `X | null`;
// Required<> only strips the optionality a pydantic default introduces.
export type PurchaseRead = Required<S['PurchaseRead']>
// One row of the stack (18a): a trip plus its line count and receipt flag.
// `items` carries the trip's lines when the page was asked for them
// (include_items); null means «not asked», never «no lines».
export type PurchaseSummary = Required<Omit<S['PurchaseSummary'], 'items'>> & {
  items: ListItem[] | null
}
export type PurchasePage = Required<Omit<S['PurchasePage'], 'purchases'>> & {
  purchases: PurchaseSummary[]
}
// One matched trip in a stack search (21b): the trip's summary plus only the
// lines that matched. «N de M» is lines.length of trip.line_count.
export type PurchaseSearchTrip = Required<
  Omit<S['PurchaseSearchTrip'], 'trip' | 'lines'>
> & { trip: PurchaseSummary; lines: ListItem[] }
export type PurchaseSearchResults = Required<
  Omit<S['PurchaseSearchResults'], 'results'>
> & { results: PurchaseSearchTrip[] }
/** Same-name match in one of the user's other lists (JAV-138). Null = no match. */
export type ElsewhereMatch = S['ElsewhereMatchRead']
export type MatchedLine = Required<S['MatchedLine']>
export type UnmatchedLine = Required<S['UnmatchedLine']>
export type ReceiptScanResult = Required<
  Omit<S['ReceiptScanResult'], 'matched' | 'unmatched'>
> & { matched: MatchedLine[]; unmatched: UnmatchedLine[] }
export type ReceiptPriceApplyResult = S['ReceiptPriceApplyResult']
// Stored receipt files (25b): per-trip scan summaries and signed URLs.
export type ReceiptScanSummary = S['ReceiptScanSummary']
export type ReceiptFileUrlResult = S['ReceiptFileUrlResult']
export type ReceiptUploadUrlResult = S['ReceiptUploadUrlResult']

// Requests
export type ParsedLine = S['ParsedLine']
export type ReceiptScanRequest = S['ReceiptScanRequest']
export type PricePatch = S['PricePatch']
export type NameMapping = S['NameMappingCreate']
export type NewPurchasedItem = S['NewPurchasedItem']
export type ReceiptPriceBatch = S['ReceiptPriceBatch']
export type ReceiptUploadUrlRequest = S['ReceiptUploadUrlRequest']
// Close-trip (10b) and manual/back-dated (26a) purchase bodies.
export type PurchaseLine = S['PurchaseLine']
export type PurchaseNewItem = S['PurchaseNewItem']
export type PurchaseCloseBody = S['PurchaseCloseBody']
export type PurchaseManualBody = S['PurchaseManualBody']

export type PriceType = ParsedLine['price_type']

/** Frontend-only types below — these never cross the API boundary. */

export interface ParsedInput {
  name: string
  quantity: string | null
  brand: string | null
  stores: string[]
  ean?: string | null
}

export interface Member {
  id: string
  displayName: string
  initial: string
  color: string
  photoUrl: string | null
}

export type TagField = 'brand' | 'quantity'

export interface EditingTag {
  itemId: string
  field: TagField | 'stores'
}
