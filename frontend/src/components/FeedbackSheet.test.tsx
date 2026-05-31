import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FeedbackSheet } from './FeedbackSheet'

describe('FeedbackSheet', () => {
  it('prefills the optional email field', () => {
    render(
      <FeedbackSheet
        defaultEmail="alice@example.com"
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com')
  })

  it('keeps submit disabled for blank messages', () => {
    render(
      <FeedbackSheet
        defaultEmail="alice@example.com"
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/mensaje/i), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled()
  })

  it('submits trimmed message and nullable email', () => {
    const onSubmit = vi.fn()
    render(
      <FeedbackSheet
        defaultEmail="alice@example.com"
        isSubmitting={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/mensaje/i), { target: { value: '  Great app  ' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    expect(onSubmit).toHaveBeenCalledWith({ message: 'Great app', email: null, source: 'manual' })
  })

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <FeedbackSheet
        defaultEmail={null}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(
      <FeedbackSheet
        defaultEmail={null}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
