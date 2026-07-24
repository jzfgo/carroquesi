import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

import { usePushNavigation } from './usePushNavigation'

type Listener = (event: MessageEvent) => void

let listeners: Listener[] = []

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('usePushNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listeners = []
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
        removeEventListener: (_type: string, fn: Listener) => {
          listeners = listeners.filter((l) => l !== fn)
        },
      },
      configurable: true,
    })
  })

  it('routes to the url the worker asks for', () => {
    renderHook(() => usePushNavigation(), { wrapper })

    listeners.forEach((l) =>
      l({ data: { type: 'NAVIGATE', url: '/lists/l1' } } as MessageEvent),
    )

    expect(navigate).toHaveBeenCalledWith('/lists/l1')
  })

  it('ignores unrelated worker messages', () => {
    renderHook(() => usePushNavigation(), { wrapper })

    listeners.forEach((l) => {
      l({ data: { type: 'SOMETHING_ELSE', url: '/lists/l1' } } as MessageEvent)
      l({ data: { type: 'NAVIGATE' } } as MessageEvent)
      l({ data: undefined } as MessageEvent)
    })

    expect(navigate).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => usePushNavigation(), { wrapper })
    unmount()
    expect(listeners).toHaveLength(0)
  })
})
