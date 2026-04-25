export interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  brand: string | null
  stores: string[]
  purchased: boolean
  purchased_at: string | null
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
  price?: number | null
  pricePer?: 'KILOGRAM' | null
}

export interface Member {
  id: string
  displayName: string
  initial: string
  colour: string
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
