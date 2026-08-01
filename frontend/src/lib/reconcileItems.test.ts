import { describe, expect, it } from 'vitest'
import type { ListItem } from '../types'
import { reconcileItems } from './reconcileItems'

function item(id: string, overrides: Partial<ListItem> = {}): ListItem {
  return {
    id,
    list_id: 'list-1',
    name: id,
    quantity: null,
    purchased_quantity: null,
    brand: null,
    stores: [],
    purchased: false,
    purchased_at: null,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const nothingWritten = () => false
const written =
  (...ids: string[]) =>
  (id: string) =>
    ids.includes(id)

describe('reconcileItems', () => {
  it('takes the server list when nothing was written locally', () => {
    const server = [item('a'), item('b')]
    const merged = reconcileItems(server, [item('a')], nothingWritten)
    expect(merged.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('keeps the local value of an item written after the read started', () => {
    const server = [item('a', { purchased: false }), item('b')]
    const local = [item('a', { purchased: true }), item('b')]
    const merged = reconcileItems(server, local, written('a'))
    expect(merged.map((i) => i.id)).toEqual(['a', 'b'])
    expect(merged[0].purchased).toBe(true)
  })

  it('takes the server value of an item written before the read started', () => {
    const server = [item('a', { purchased: false })]
    const local = [item('a', { purchased: true })]
    const merged = reconcileItems(server, local, nothingWritten)
    expect(merged[0].purchased).toBe(false)
  })

  it('keeps a local delete the server has not applied yet', () => {
    const server = [item('a'), item('b')]
    const merged = reconcileItems(server, [item('b')], written('a'))
    expect(merged.map((i) => i.id)).toEqual(['b'])
  })

  it('keeps a local add the server does not know about yet', () => {
    const server = [item('a'), item('b')]
    const local = [item('a'), item('tmp-1'), item('b')]
    const merged = reconcileItems(server, local, written('tmp-1'))
    expect(merged.map((i) => i.id)).toEqual(['a', 'tmp-1', 'b'])
  })

  it('drops a local item the server removed and nobody wrote here', () => {
    const merged = reconcileItems(
      [item('a')],
      [item('a'), item('b')],
      written(),
    )
    expect(merged.map((i) => i.id)).toEqual(['a'])
  })

  it('clamps a local-only item whose index is past the merged end', () => {
    const local = [item('a'), item('b'), item('tmp-1')]
    const merged = reconcileItems([], local, written('tmp-1'))
    expect(merged.map((i) => i.id)).toEqual(['tmp-1'])
  })

  it('applies the server order to items nobody wrote', () => {
    const server = [item('b'), item('a')]
    const merged = reconcileItems(server, [item('a'), item('b')], written())
    expect(merged.map((i) => i.id)).toEqual(['b', 'a'])
  })
})
