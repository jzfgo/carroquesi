import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationPrimingCard } from './NotificationPrimingCard'

const props = {
  canReceive: true,
  permission: 'default' as const,
  hasSharingIntent: true,
  isIOS: false,
  onEnable: vi.fn(),
}

describe('NotificationPrimingCard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('offers to enable notifications when sharing intent exists', () => {
    render(<NotificationPrimingCard {...props} />)
    expect(
      screen.getByRole('button', { name: /activar avisos/i }),
    ).toBeInTheDocument()
  })

  it('stays hidden without sharing intent', () => {
    render(<NotificationPrimingCard {...props} hasSharingIntent={false} />)
    expect(screen.queryByRole('button', { name: /activar avisos/i })).toBeNull()
  })

  it('stays hidden once permission was already answered', () => {
    render(<NotificationPrimingCard {...props} permission="granted" />)
    expect(screen.queryByRole('button', { name: /activar avisos/i })).toBeNull()
  })

  it('guides iOS users to install instead of offering a prompt that cannot work', () => {
    render(<NotificationPrimingCard {...props} canReceive={false} isIOS />)
    expect(screen.getByText(/pantalla de inicio/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /activar avisos/i })).toBeNull()
  })

  it('stays hidden after dismissal', () => {
    const { unmount } = render(<NotificationPrimingCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /descartar/i }))
    unmount()
    render(<NotificationPrimingCard {...props} />)
    expect(screen.queryByRole('button', { name: /activar avisos/i })).toBeNull()
  })

  it('calls onEnable from the user gesture', () => {
    render(<NotificationPrimingCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /activar avisos/i }))
    expect(props.onEnable).toHaveBeenCalledOnce()
  })
})
