export interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  brand: string | null
  variety: string | null
  store: string | null
  purchased: boolean
  added_by: string       // user UUID
  created_at: string
  updated_at: string
}

export interface ParsedInput {
  name: string           // empty string if no name tokens found
  quantity: string | null
  variety: string | null
  brand: string | null
  store: string | null
}

export interface Member {
  id: string
  displayName: string
  initial: string
  colour: string
  photoUrl: string | null
}

export type TagField = 'variety' | 'brand' | 'store' | 'quantity'

export interface EditingTag {
  itemId: string
  field: TagField
}

export interface ApiList {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
  item_count: number
  purchased_count: number
}
