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

export interface PriceRecordRead {
  id: string
  list_item_id: string
  ean: string | null
  amount: number
  price_per: 'KILOGRAM' | null
  store: string | null
  user_id: string
  recorded_at: string
}

export interface StoreGroup {
  store: string | null
  records: PriceRecordRead[]
}

export interface PriceHistoryResponse {
  groups: StoreGroup[]
  community_price: number | null
  community_price_per: 'KILOGRAM' | null
}
