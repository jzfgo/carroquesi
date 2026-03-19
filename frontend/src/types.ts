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
}

export type TagField = 'variety' | 'brand' | 'store'

export interface EditingTag {
  itemId: string
  field: TagField
}
