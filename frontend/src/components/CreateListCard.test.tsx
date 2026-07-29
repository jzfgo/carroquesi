import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CreateListCard } from './CreateListCard'

describe('CreateListCard', () => {
  it('shows "Crea tu primera lista" when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(screen.getByText(/primera lista/i)).toBeInTheDocument()
  })

  it('shows "+ Nueva lista" when not isFirst', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    expect(screen.getByText(/nueva lista/i)).toBeInTheDocument()
  })

  it('expands to input when clicked', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument()
  })

  it('confirm button is disabled when name is empty', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: /crear/i })).toBeDisabled()
  })

  it('calls onCreate with the typed name and collapses', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Costco'))
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/nombre/i)).not.toBeInTheDocument(),
    )
  })

  // The counterpart to the collapse test above: same click, opposite answer
  // from onCreate. Asserting the input's *value* rather than its presence is
  // the point — a card that stayed expanded but empty would still have thrown
  // the name away, and only the value assertion can tell those apart.
  it('keeps the name and stays open when the create is refused', async () => {
    const onCreate = vi.fn().mockResolvedValue(false)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Costco'))
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('Costco')
    // And still submittable — a refusal must not leave the button disabled
    // from the `creating` flag.
    expect(screen.getByRole('button', { name: /crear/i })).toBeEnabled()
  })

  // `creating` reaches the button's `disabled` and nothing else, so the Enter
  // path was never covered by it — and Enter leaves focus in the input, which
  // is exactly where a user sits while waiting.
  //
  // JAV-61 made this reachable on the failure path rather than creating it: a
  // refused create now deliberately keeps the card open with the name in it,
  // which is the state someone retries from. With no idempotency key on the
  // endpoint (JAV-69), a second in-flight submit is a second list.
  it('will not submit twice while the first create is in flight', async () => {
    let release!: (v: boolean) => void
    const onCreate = vi.fn().mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve
      }),
    )
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    const input = screen.getByPlaceholderText(/nombre/i)
    fireEvent.change(input, { target: { value: 'Costco' } })

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    // Still in flight, focus still in the field, user presses Enter again.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledTimes(1)

    release(true)
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/nombre/i)).not.toBeInTheDocument(),
    )
  })

  it('ESC key collapses the input and clears the name', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText(/nombre/i), {
      key: 'Escape',
    })
    expect(screen.queryByPlaceholderText(/nombre/i)).not.toBeInTheDocument()
    // After re-expand, input should be empty
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByPlaceholderText(/nombre/i)).toHaveValue('')
  })

  it('ENTER key submits the form', async () => {
    const onCreate = vi.fn().mockResolvedValue(true)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Mercado' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText(/nombre/i), { key: 'Enter' })
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Mercado'))
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
