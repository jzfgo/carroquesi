import type { ListItem, Member } from './types'

export const MOCK_LIST_ID = 'list-001'

// Deterministic colour palette for avatars
export const AVATAR_COLOURS = [
  '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#9333ea',
]

export const MOCK_MEMBERS: Member[] = [
  { id: 'user-javi', displayName: 'Javier', initial: 'J', colour: AVATAR_COLOURS[0], photoUrl: null },
  { id: 'user-elena', displayName: 'Elena', initial: 'E', colour: AVATAR_COLOURS[1], photoUrl: null },
]

export const MOCK_ITEMS: ListItem[] = [
  {
    id: 'item-1', list_id: MOCK_LIST_ID,
    name: 'Leche', quantity: '2 unidades',
    variety: 'Entera', brand: 'Hacendado', store: 'Mercadona',
    purchased: false, added_by: 'user-javi',
    created_at: '2026-03-19T10:00:00Z', updated_at: '2026-03-19T10:00:00Z',
  },
  {
    id: 'item-2', list_id: MOCK_LIST_ID,
    name: 'Huevos', quantity: '12 unidades',
    variety: null, brand: null, store: null,
    purchased: false, added_by: 'user-elena',
    created_at: '2026-03-19T10:01:00Z', updated_at: '2026-03-19T10:01:00Z',
  },
  {
    id: 'item-3', list_id: MOCK_LIST_ID,
    name: 'Tomates cherry', quantity: '1 bolsa',
    variety: null, brand: 'Florette', store: null,
    purchased: false, added_by: 'user-javi',
    created_at: '2026-03-19T10:02:00Z', updated_at: '2026-03-19T10:02:00Z',
  },
  {
    id: 'item-4', list_id: MOCK_LIST_ID,
    name: 'Pan de molde integral', quantity: '1',
    variety: 'Sin corteza', brand: 'Bimbo', store: 'Carrefour',
    purchased: true, added_by: 'user-elena',
    created_at: '2026-03-19T10:03:00Z', updated_at: '2026-03-19T10:03:00Z',
  },
]
