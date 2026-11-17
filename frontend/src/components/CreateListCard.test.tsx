import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import { CreateListCard } from './CreateListCard'

type OnCreate = (
  name: string,
  emoji: string,
  createKey: string,
) => Promise<boolean>

function typeName(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
    target: { value },
  })
}

async function submitAndSettle() {
  fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Crear lista' })).toBeEnabled(),
  )
}

describe('CreateListCard', () => {
  it('shows the "Crear la primera lista" button when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Crear la primera lista' }),
    ).toBeInTheDocument()
  })

  it('shows the one-sentence lead when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(
      screen.getByText('Empieza una y compártela en casa.'),
    ).toBeInTheDocument()
  })

  it('shows the "Nueva lista" row when not isFirst', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    expect(screen.getByText(/nueva lista/i)).toBeInTheDocument()
  })

  it('the empty-state button opens the Nueva lista sheet', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Crear la primera lista' }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Nueva lista' }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument()
  })

  it('the row opens the sheet with a curated emoji already set in the tile', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = screen.getByRole('dialog', { name: 'Nueva lista' })
    // The tile is aria-hidden; read its text and confirm it's a curated pick.
    const tile = dialog.querySelector('.create-list-sheet__emoji-tile')
    expect(tile).not.toBeNull()
    expect(CURATED_EMOJIS).toContain(tile?.textContent)
  })

  it('confirm button is disabled when name is empty', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'Crear lista' })).toBeDisabled()
  })

  it('calls onCreate with the typed name and the shown emoji, then closes', async () => {
    const onCreate = vi.fn(async () => true)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    const emoji = screen
      .getByRole('dialog', { name: 'Nueva lista' })
      .querySelector('.create-list-sheet__emoji-tile')?.textContent
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }))
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        'Costco',
        emoji,
        expect.any(String),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Nueva lista' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('ESC closes the sheet and a fresh open starts with an empty field', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByRole('dialog', { name: 'Nueva lista' }),
    ).not.toBeInTheDocument()
    // Re-opening mounts a fresh sheet, so the field is empty again.
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('')
  })

  it('ENTER key submits', async () => {
    const onCreate = vi.fn(async () => true)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Mercado' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText(/nombre/i), { key: 'Enter' })
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        'Mercado',
        expect.any(String),
        expect.any(String),
      ),
    )
  })

  it('a refused create keeps the sheet open with the typed name', async () => {
    const onCreate = vi.fn(async () => false)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    typeName('Costco')
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Crear lista' })).toBeEnabled(),
    )
    expect(
      screen.getByRole('dialog', { name: 'Nueva lista' }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('Costco')
  })

  it('a create that throws keeps the sheet open with the typed name', async () => {
    const onCreate = vi.fn(async () => {
      throw new Error('boom')
    })
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    typeName('Costco')
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Crear lista' })).toBeEnabled(),
    )
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('Costco')
  })

  it('a retry of the same name reuses the create key', async () => {
    const onCreate = vi.fn<OnCreate>(async () => false)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    typeName('Costco')
    await submitAndSettle()
    await submitAndSettle()
    const [first, second] = onCreate.mock.calls.map((c) => c[2])
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(second).toBe(first)
  })

  it('editing the name mints a new create key', async () => {
    const onCreate = vi.fn<OnCreate>(async () => false)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    typeName('Costco')
    await submitAndSettle()
    typeName('Costco 2')
    await submitAndSettle()
    const [first, second] = onCreate.mock.calls.map((c) => c[2])
    expect(second).not.toBe(first)
  })

  it('shows mascot when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  })

  it('shows "Aún no tienes listas" text when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(screen.getByText(/Aún no tienes listas/i)).toBeInTheDocument()
  })

  it('does not show mascot when not isFirst', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    expect(
      screen.queryByRole('img', { name: /mascota/i }),
    ).not.toBeInTheDocument()
  })
})
