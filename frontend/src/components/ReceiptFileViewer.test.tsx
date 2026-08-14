import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi, type Mock } from 'vitest'
import { getPdfjs } from '../lib/pdfjs'
import { ReceiptFileViewer } from './ReceiptFileViewer'

vi.mock('../lib/pdfjs', () => ({
  getPdfjs: vi.fn(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 140 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
      destroy: () => undefined,
    }),
  })),
}))

const URL = 'https://storage.example/signed-get'

test('an image renders fullscreen without touching pdf.js', () => {
  const { container } = render(
    <ReceiptFileViewer
      url={URL}
      contentType="image/jpeg"
      pages={null}
      onClose={() => {}}
    />,
  )
  expect(container.querySelector('.rfv__img')).toHaveAttribute('src', URL)
  expect(getPdfjs).not.toHaveBeenCalled()
})

test('Escape, the scrim and the close button all dismiss', () => {
  const onClose = vi.fn()
  const { container } = render(
    <ReceiptFileViewer
      url={URL}
      contentType="image/jpeg"
      pages={null}
      onClose={onClose}
    />,
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.click(container.querySelector('.rfv')!)
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(onClose).toHaveBeenCalledTimes(3)
})

test('a click on the photo itself does not dismiss', () => {
  const onClose = vi.fn()
  const { container } = render(
    <ReceiptFileViewer
      url={URL}
      contentType="image/jpeg"
      pages={null}
      onClose={onClose}
    />,
  )
  fireEvent.click(container.querySelector('.rfv__img')!)
  expect(onClose).not.toHaveBeenCalled()
})

test('a PDF lays its pages on the snap track with the counter', async () => {
  const { container } = render(
    <ReceiptFileViewer
      url={URL}
      contentType="application/pdf"
      pages={3}
      onClose={() => {}}
    />,
  )
  await waitFor(() =>
    expect(container.querySelectorAll('.rfv__page')).toHaveLength(3),
  )
  expect(screen.getByText('1 / 3')).toBeInTheDocument()
})

test('a PDF that cannot load says so instead of crashing', async () => {
  ;(getPdfjs as Mock).mockRejectedValueOnce(new Error('offline'))
  render(
    <ReceiptFileViewer
      url={URL}
      contentType="application/pdf"
      pages={2}
      onClose={() => {}}
    />,
  )
  expect(
    await screen.findByText('No se pudo cargar el ticket'),
  ).toBeInTheDocument()
})
