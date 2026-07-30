export interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  purchased_quantity?: string | null
  brand: string | null
  stores: string[]
  purchased: boolean
  purchased_at: string | null
  purchase_id?: string | null
  /** `closed_at ?? tears_off_at` — when this item's trip stopped accepting
   *  items. One stamped instant, so nothing on this side does date arithmetic. */
  purchase_ends_at?: string | null
  /** `trip.closed_at is not None` — whether this item's trip has been filed
   *  ("Cerrar compra", or a receipt scan). Not derivable from
   *  `purchase_ends_at`/`itemState()`: a torn-off-but-unfiled trip and a
   *  closed one both read as 'bought' there, yet DELETE behaves oppositely
   *  for the two. Optional/undefined reads as "not filed" — same convention
   *  as `purchase_ends_at`. */
  purchase_filed?: boolean
  ean: string | null
  price: number | null
  price_per: string | null
  price_store: string | null
  added_by: string
  created_at: string
  updated_at: string
}

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

export interface Suggestion {
  name: string
  brand: string | null
  stores: string[]
}

export interface DueSuggestion {
  name: string
  brand: string | null
  stores: string[]
  days_overdue: number
  dismissal_ttl_days: number
  median_interval_days: number
  days_since_last: number
  avg_quantity: number | null
}

export interface BarcodeRead {
  ean: string
  name: string
  brand: string | null
  stores: string[]
  community_price: number | null
  community_price_per: 'KILOGRAM' | null
}

export type TagField = 'brand' | 'quantity'

export interface EditingTag {
  itemId: string
  field: TagField | 'stores'
}

export interface ApiList {
  id: string
  name: string
  emoji: string | null
  owner_id: string
  created_at: string
  updated_at: string
  item_count: number
  purchased_count: number
  /** Whether this list is the requesting user's default (Siri target). */
  is_default: boolean
}

export interface PriceEntry {
  amount: number
  price_per: string | null
  store: string | null
  purchased_at: string | null
  quantity: string | null
}

export interface PriceHistoryResponse {
  entries: PriceEntry[]
  community_price: number | null
  community_price_per: string | null
}

/** Receipt Scan Types */

type PriceType = 'UNIT' | 'KILOGRAM' | 'MULTI'

export interface ParsedLine {
  name: string
  price_type: PriceType
  unit_price: number
  quantity: number | null
  line_total: number
}

export interface ReceiptScanRequest {
  store: string | null
  receipt_date: string | null
  receipt_total: number | null
  lines: ParsedLine[]
}

export interface MatchedLine {
  /** Position in the `lines` array sent to the scan endpoint. The response
   *  splits lines into `matched` and `unmatched`, which loses the order they
   *  were printed in. This is what puts them back in order. */
  index: number
  receipt_name: string
  item_id: string
  item_name: string
  price_type: PriceType
  unit_price: number
  quantity: number | null
  line_total: number
  /** True when a person already confirmed this receipt name for this shop. */
  confirmed: boolean
}

export interface UnmatchedLine {
  /** Position in the `lines` array sent to the scan endpoint. */
  index: number
  receipt_name: string
  price_type: PriceType
  unit_price: number
  quantity: number | null
  line_total: number
}

export interface ReceiptScanResult {
  scan_id: string
  store: string | null
  receipt_date: string | null
  receipt_total: number | null
  matched: MatchedLine[]
  unmatched: UnmatchedLine[]
}

export interface NewPurchasedItem {
  name: string
  brand: string | null
  ean: string | null
  price: number
  price_per: string | null
  store: string | null
  quantity: string | null
}

/** Purchase ("trip") Types */

export interface Purchase {
  id: string
  list_id: string
  opened_at: string
  tears_off_at: string
  closed_at: string | null
  store: string | null
  total: number | null
}

export interface PurchaseLine {
  item_id: string
  price?: number | null
  price_per?: 'KILOGRAM' | null
  quantity?: string | null
}

export interface PurchaseNewItem {
  name: string
  brand?: string | null
  ean?: string | null
  price?: number | null
  price_per?: 'KILOGRAM' | null
  quantity?: string | null
}

/** Learned receipt→item name mapping for a purchase close. No `store`: a
 *  ticket belongs to one shop, stated once as the close's own `store`. */
export interface PurchaseNameMapping {
  receipt_name: string
  item_name: string
  item_brand: string | null
}

export interface PurchaseClosePayload {
  purchase_id?: string | null
  store: string
  purchased_at?: string | null
  total?: number | null
  lines: PurchaseLine[]
  new_items: PurchaseNewItem[]
  scan_id?: string | null
  mappings?: PurchaseNameMapping[]
}
