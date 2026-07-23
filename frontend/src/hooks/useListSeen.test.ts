import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api', () => ({
  markListSeen: vi.fn(() => Promise.resolve(null)),
}))

import { markListSeen } from '../lib/api'
import { useListSeen } from './useListSeen'

const getToken = () => Promise.resolve('t')

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
}

describe('useListSeen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setVisibility('visible')
  })

  it('marks the list seen on mount when visible', () => {
    renderHook(() => useListSeen('l1', getToken))
    expect(markListSeen).toHaveBeenCalledWith(getToken, 'l1')
  })

  it('does not mark seen while hidden', () => {
    setVisibility('hidden')
    renderHook(() => useListSeen('l1', getToken))
    expect(markListSeen).not.toHaveBeenCalled()
  })

  it('marks seen when the tab becomes visible again', () => {
    setVisibility('hidden')
    renderHook(() => useListSeen('l1', getToken))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(markListSeen).toHaveBeenCalledWith(getToken, 'l1')
  })

  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => useListSeen('l1', getToken))
    vi.clearAllMocks()
    unmount()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(markListSeen).not.toHaveBeenCalled()
  })
})
