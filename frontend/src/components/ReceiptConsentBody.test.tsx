import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReceiptConsentBody } from './ReceiptConsentBody'

describe('ReceiptConsentBody', () => {
  it('discloses the AI read and the stored file', () => {
    render(<ReceiptConsentBody onDecision={vi.fn()} />)
    expect(screen.getByText(/IA de Google/i)).toBeInTheDocument()
    expect(screen.getByText(/Guardamos el ticket/i)).toBeInTheDocument()
    expect(screen.getByText(/en Ajustes/i)).toBeInTheDocument()
  })

  it('reports a grant from "Activar escaneo"', () => {
    const onDecision = vi.fn()
    render(<ReceiptConsentBody onDecision={onDecision} />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar escaneo' }))
    expect(onDecision).toHaveBeenCalledWith('granted')
  })

  it('reports a decline from "Ahora no"', () => {
    const onDecision = vi.fn()
    render(<ReceiptConsentBody onDecision={onDecision} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onDecision).toHaveBeenCalledWith('declined')
  })

  it('disables both actions while a decision is being written', () => {
    render(<ReceiptConsentBody onDecision={vi.fn()} busy />)
    expect(
      screen.getByRole('button', { name: 'Activar escaneo' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeDisabled()
  })
})
