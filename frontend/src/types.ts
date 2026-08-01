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
export type MatchedLine = Required<S['MatchedLine']>
export type UnmatchedLine = Required<S['UnmatchedLine']>
export type ReceiptScanResult = Required<
  Omit<S['ReceiptScanResult'], 'matched' | 'unmatched'>
> & { matched: MatchedLine[]; unmatched: UnmatchedLine[] }
export type ReceiptPriceApplyResult = S['ReceiptPriceApplyResult']

// Requests
export type ParsedLine = S['ParsedLine']
export type ReceiptScanRequest = S['ReceiptScanRequest']
export type PricePatch = S['PricePatch']
export type NameMapping = S['NameMappingCreate']
export type NewPurchasedItem = S['NewPurchasedItem']
export type ReceiptPriceBatch = S['ReceiptPriceBatch']

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
