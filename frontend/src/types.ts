export interface ListItem {
  id: string;
  list_id: string;
  name: string;
  quantity: string | null;
  purchased_quantity?: string | null;
  brand: string | null;
  stores: string[];
  purchased: boolean;
  purchased_at: string | null;
  ean: string | null;
  price: number | null;
  price_per: string | null;
  price_store: string | null;
  added_by: string;
  created_at: string;
  updated_at: string;
}

export interface ParsedInput {
  name: string;
  quantity: string | null;
  brand: string | null;
  stores: string[];
  ean?: string | null;
}

export interface Member {
  id: string;
  displayName: string;
  initial: string;
  color: string;
  photoUrl: string | null;
}

export interface Suggestion {
  name: string;
  brand: string | null;
  stores: string[];
}

export interface DueSuggestion {
  name: string;
  brand: string | null;
  stores: string[];
  days_overdue: number;
  dismissal_ttl_days: number;
  median_interval_days: number;
  days_since_last: number;
  avg_quantity: number | null;
}

export interface BarcodeRead {
  ean: string;
  name: string;
  brand: string | null;
  stores: string[];
  community_price: number | null;
  community_price_per: "KILOGRAM" | null;
}

export type TagField = "brand" | "quantity";

export interface EditingTag {
  itemId: string;
  field: TagField | "stores";
}

export interface ApiList {
  id: string;
  name: string;
  emoji: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  item_count: number;
  purchased_count: number;
}

export interface PriceEntry {
  amount: number;
  price_per: string | null;
  store: string | null;
  purchased_at: string | null;
  quantity: string | null;
}

export interface PriceHistoryResponse {
  entries: PriceEntry[];
  community_price: number | null;
  community_price_per: string | null;
}

/** Receipt Scan Types */

export type PriceType = "UNIT" | "KILOGRAM" | "MULTI";

export interface ParsedLine {
  name: string;
  price_type: PriceType;
  unit_price: number;
  quantity: number | null;
  line_total: number;
}

export interface ReceiptScanRequest {
  store: string | null;
  receipt_date: string | null;
  receipt_total: number | null;
  lines: ParsedLine[];
}

export interface MatchedLine {
  receipt_name: string;
  item_id: string;
  item_name: string;
  price_type: PriceType;
  unit_price: number;
  quantity: number | null;
  line_total: number;
}

export interface UnmatchedLine {
  receipt_name: string;
  price_type: PriceType;
  unit_price: number;
  quantity: number | null;
  line_total: number;
}

export interface ReceiptScanResult {
  scan_id: string;
  store: string | null;
  receipt_date: string | null;
  receipt_total: number | null;
  matched: MatchedLine[];
  unmatched: UnmatchedLine[];
}

export interface PricePatch {
  item_id: string;
  price: number;
  price_per: string | null;
  store: string | null;
  quantity: string | null;
}

export interface NameMapping {
  store: string;
  receipt_name: string;
  item_name: string;
  item_brand: string | null;
}

export interface ReceiptPriceBatch {
  scan_id: string | null;
  patches: PricePatch[];
  mappings: NameMapping[];
}
