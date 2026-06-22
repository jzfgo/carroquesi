import { describe, expect, test } from 'vitest';
import type { ListItem } from '../types';
import { filterItems } from './useItemFilter';

const base: ListItem = {
  id: '?',
  list_id: 'l1',
  name: '',
  quantity: null,
  brand: null,
  stores: [],
  purchased: false,
  purchased_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
};

const items: ListItem[] = [
  {
    ...base,
    id: 'a',
    name: 'Leche entera',
    stores: ['Mercadona'],
    brand: null,
  },
  {
    ...base,
    id: 'b',
    name: 'Yogur natural',
    stores: ['Mercadona'],
    brand: 'Danone',
  },
  { ...base, id: 'c', name: 'Manzanas', stores: ['Lidl'], brand: null },
  { ...base, id: 'd', name: 'Aceite de oliva', stores: [], brand: null },
];

describe('useItemFilter', () => {
  test('empty query returns the exact same array reference', () => {
    expect(filterItems(items, '')).toBe(items);
  });

  test('name filter is a case-insensitive substring match', () => {
    expect(filterItems(items, 'leche').map((i) => i.id)).toEqual(['a']);
  });

  test('name filter returns nothing when no item matches', () => {
    expect(filterItems(items, 'naranja')).toHaveLength(0);
  });

  test('@store filter includes items at that store', () => {
    const ids = filterItems(items, '@Mercadona').map((i) => i.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  test('@store filter always passes items with no stores', () => {
    expect(filterItems(items, '@Mercadona').map((i) => i.id)).toContain('d');
  });

  test('@store filter hides items assigned to a different store', () => {
    expect(filterItems(items, '@Mercadona').map((i) => i.id)).not.toContain(
      'c',
    );
  });

  test('multiple @store sigils OR together', () => {
    const ids = filterItems(items, '@Mercadona @Lidl').map((i) => i.id);
    expect(ids).toContain('a'); // Mercadona
    expect(ids).toContain('b'); // Mercadona
    expect(ids).toContain('c'); // Lidl
    expect(ids).toContain('d'); // no stores — always passes
  });

  test('#brand filter matches by brand (case-insensitive)', () => {
    expect(filterItems(items, '#danone').map((i) => i.id)).toEqual(['b']);
  });

  test('#brand filter hides items with no brand', () => {
    expect(filterItems(items, '#Danone').map((i) => i.id)).not.toContain('a');
  });

  test('@store and #brand AND together', () => {
    // Only item b is at Mercadona AND has brand Danone
    // Item d passes the store filter (no stores) but fails brand filter (brand is null)
    expect(filterItems(items, '@Mercadona #Danone').map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  test('free text AND @store together', () => {
    expect(filterItems(items, 'leche @Mercadona').map((i) => i.id)).toEqual([
      'a',
    ]);
  });

  describe('strictStore option', () => {
    test('excludes items with no store when strictStore is true', () => {
      expect(
        filterItems(items, '@Mercadona', { strictStore: true }).map(
          (i) => i.id,
        ),
      ).not.toContain('d');
    });

    test('still includes matching-store items when strictStore is true', () => {
      const ids = filterItems(items, '@Mercadona', { strictStore: true }).map(
        (i) => i.id,
      );
      expect(ids).toContain('a');
      expect(ids).toContain('b');
    });

    test('still excludes wrong-store items when strictStore is true', () => {
      expect(
        filterItems(items, '@Mercadona', { strictStore: true }).map(
          (i) => i.id,
        ),
      ).not.toContain('c');
    });

    test('defaults to chip behaviour (pass-through) when strictStore is omitted', () => {
      expect(filterItems(items, '@Mercadona').map((i) => i.id)).toContain('d');
    });
  });

  test('filters purchased items by the same logic as unpurchased', () => {
    const mixed: ListItem[] = [
      {
        ...base,
        id: 'x',
        name: 'Pan',
        stores: ['Mercadona'],
        purchased: false,
      },
      {
        ...base,
        id: 'y',
        name: 'Pan',
        stores: ['Lidl'],
        purchased: true,
        purchased_at: '2026-01-01T10:00:00',
      },
    ];
    const ids = filterItems(mixed, '@Mercadona').map((i) => i.id);
    expect(ids).toContain('x');
    expect(ids).not.toContain('y');
  });
});
