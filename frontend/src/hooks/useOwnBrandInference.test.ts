import { renderHook, act } from '@testing-library/react'
import { useOwnBrandInference } from './useOwnBrandInference'

describe('useOwnBrandInference', () => {
  test('unknown brand — visibleChip and storeToAdd are null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Danone', [])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('null brand — visibleChip and storeToAdd are null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference(null, [])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('known brand not in explicitStores — chip and storeToAdd are set', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', [])
    )
    expect(result.current.visibleChip).toBe('Mercadona')
    expect(result.current.storeToAdd).toBe('Mercadona')
  })

  test('known brand already in explicitStores (exact) — both null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', ['Mercadona'])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('known brand already in explicitStores (case-insensitive) — both null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', ['mercadona'])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('known brand with other stores but not its own — chip is shown', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', ['Carrefour'])
    )
    expect(result.current.visibleChip).toBe('Mercadona')
    expect(result.current.storeToAdd).toBe('Mercadona')
  })

  test('after dismiss — visibleChip and storeToAdd are null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', [])
    )
    act(() => { result.current.dismiss() })
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('dismissed state resets when brand changes', () => {
    let brand = 'Hacendado'
    const { result, rerender } = renderHook(() =>
      useOwnBrandInference(brand, [])
    )
    act(() => { result.current.dismiss() })
    expect(result.current.visibleChip).toBeNull()

    brand = 'Milbona'
    rerender()
    expect(result.current.visibleChip).toBe('Lidl')
    expect(result.current.storeToAdd).toBe('Lidl')
  })

  test('dismissed state resets when same brand re-entered after being cleared', () => {
    let brand: string | null = 'Hacendado'
    const { result, rerender } = renderHook(() =>
      useOwnBrandInference(brand, [])
    )
    act(() => { result.current.dismiss() })
    expect(result.current.visibleChip).toBeNull()

    brand = null
    rerender()
    brand = 'Hacendado'
    rerender()
    expect(result.current.visibleChip).toBe('Mercadona')
  })
})
