export type PriceType = 'UNIT' | 'KILOGRAM' | 'MULTI'

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
  receipt_name: string
  item_id: string
  item_name: string
  price_type: PriceType
  unit_price: number
  quantity: number | null
  line_total: number
}

export interface UnmatchedLine {
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

export interface PricePatch {
  item_id: string
  price: number
  price_per: string | null
  store: string | null
  quantity: string | null
}

export interface NameMapping {
  store: string
  receipt_name: string
  item_name: string
  item_brand: string | null
}

export interface ReceiptPriceBatch {
  scan_id: string | null
  patches: PricePatch[]
  mappings: NameMapping[]
}
