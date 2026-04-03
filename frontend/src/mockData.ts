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
    name: 'Leche Entera', quantity: '2 unidades',
    brand: 'Hacendado', stores: ['Mercadona'],
    purchased: false, added_by: 'user-javi',
    created_at: '2026-03-19T10:00:00Z', updated_at: '2026-03-19T10:00:00Z',
  },
  {
    id: 'item-2', list_id: MOCK_LIST_ID,
    name: 'Huevos', quantity: '12 unidades',
    brand: null, stores: [],
    purchased: false, added_by: 'user-elena',
    created_at: '2026-03-19T10:01:00Z', updated_at: '2026-03-19T10:01:00Z',
  },
  {
    id: 'item-3', list_id: MOCK_LIST_ID,
    name: 'Tomates cherry', quantity: '1 bolsa',
    brand: 'Florette', stores: [],
    purchased: false, added_by: 'user-javi',
    created_at: '2026-03-19T10:02:00Z', updated_at: '2026-03-19T10:02:00Z',
  },
  {
    id: 'item-4', list_id: MOCK_LIST_ID,
    name: 'Pan de molde integral Sin corteza', quantity: '1',
    brand: 'Bimbo', stores: ['Carrefour'],
    purchased: true, added_by: 'user-elena',
    created_at: '2026-03-19T10:03:00Z', updated_at: '2026-03-19T10:03:00Z',
  },
]
