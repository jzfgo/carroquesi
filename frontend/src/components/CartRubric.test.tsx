import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { CartRubric } from './CartRubric'

test('prints what is in the cart', () => {
  render(<CartRubric count={3} />)
  expect(screen.getByText('En el carro · 3')).toBeInTheDocument()
})

test('the whole row is the target, not the 26px stamp inside it', async () => {
  const onClose = vi.fn()
  const { container } = render(<CartRubric count={2} onClose={onClose} />)

  const row = container.querySelector('.stamp-row')!
  expect(row.tagName).toBe('BUTTON')
  await userEvent.click(row)
  expect(onClose).toHaveBeenCalledOnce()

  // The stamp is a mark that says where to look — it is not separately
  // clickable, so the row keeps a single destination (rule 1).
  expect(container.querySelectorAll('button')).toHaveLength(1)
})

test('without a way to close, the rubric prints alone rather than offering a dead stamp', () => {
  const { container } = render(<CartRubric count={2} />)
  expect(container.querySelector('.stamp')).toBeNull()
  expect(container.querySelector('button')).toBeNull()
})
