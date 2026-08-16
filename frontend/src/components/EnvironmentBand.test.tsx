import { render, screen } from '@testing-library/react'
import { EnvironmentBand } from './EnvironmentBand'

const mocks = vi.hoisted(() => ({ label: undefined as string | undefined }))

vi.mock('../lib/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/environment')>()),
  get ENVIRONMENT_LABEL() {
    return mocks.label
  },
}))

describe('EnvironmentBand', () => {
  it('renders nothing when no label is set', () => {
    mocks.label = undefined
    const { container } = render(<EnvironmentBand />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the environment when a label is set', () => {
    mocks.label = 'staging'
    render(<EnvironmentBand />)
    expect(screen.getByRole('note')).toHaveTextContent('staging')
  })
})
