import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiKeySheet } from './ApiKeySheet'

function renderSheet(onClose = vi.fn()) {
  render(
    <ApiKeySheet
      apiKey="cqs_test-key"
      defaultListName="Mercado"
      onCopy={vi.fn()}
      onImport={vi.fn()}
      onRegenerate={vi.fn(async () => undefined)}
      onClose={onClose}
    />,
  )
  return onClose
}

describe('ApiKeySheet dismissal', () => {
  it('Escape closes the sheet from the key view', () => {
    const onClose = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape in the confirm sub-state returns to the key view instead of closing', () => {
    const onClose = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar clave' }))
    expect(
      screen.getByRole('dialog', { name: 'Regenerar clave' }),
    ).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.getByRole('dialog', { name: 'Atajo de Siri' }),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('scrim click in the confirm sub-state returns to the key view instead of closing', () => {
    const onClose = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar clave' }))

    fireEvent.click(document.querySelector('.sheet-scrim')!)
    expect(
      screen.getByRole('dialog', { name: 'Atajo de Siri' }),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dismissal is inert while a regeneration is in flight', async () => {
    const onClose = vi.fn()
    let resolveRegenerate!: () => void
    render(
      <ApiKeySheet
        apiKey="cqs_test-key"
        defaultListName="Mercado"
        onCopy={vi.fn()}
        onImport={vi.fn()}
        onRegenerate={vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveRegenerate = resolve
            }),
        )}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar clave' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, regenerar' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.getByRole('dialog', { name: 'Regenerar clave' }),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    resolveRegenerate()
    expect(
      await screen.findByRole('dialog', { name: 'Atajo de Siri' }),
    ).toBeInTheDocument()
  })
})
