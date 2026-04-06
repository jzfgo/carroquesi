export interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  brand: string | null
  stores: string[]
  purchased: boolean
  added_by: string
  created_at: string
  updated_at: string
}

export interface ParsedInput {
  name: string
  quantity: string | null
  brand: string | null
  stores: string[]
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
  name: string
  brand: string | null
  stores: string[]
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
