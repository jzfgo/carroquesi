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
  fireEvent.keyDown(document.body, { key: 'Escape' })
  fireEvent.click(container.querySelector('.rfv')!)
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(onClose).toHaveBeenCalledTimes(3)
})

test('Escape stops before a sheet listening under the viewer', () => {
  // The review sheet dismisses on a document-level Escape; one press over
  // the lightbox must close only the lightbox.
  const sheetEscape = vi.fn()
  const underneath = (e: KeyboardEvent) => {
    if (e.key === 'Escape') sheetEscape()
  }
  document.addEventListener('keydown', underneath)
  const onClose = vi.fn()
  render(
    <ReceiptFileViewer
      url={URL}
      contentType="image/jpeg"
      pages={null}
      onClose={onClose}
    />,
  )
  fireEvent.keyDown(document.body, { key: 'Escape' })
  document.removeEventListener('keydown', underneath)
  expect(onClose).toHaveBeenCalledOnce()
  expect(sheetEscape).not.toHaveBeenCalled()
})

test('focuses the dialog on open and restores focus on close', () => {
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.focus()
  const { container, unmount } = render(
    <ReceiptFileViewer
      url={URL}
      contentType="image/jpeg"
      pages={null}
      onClose={() => {}}
    />,
  )
  expect(document.activeElement).toBe(container.querySelector('.rfv'))
  unmount()
  expect(document.activeElement).toBe(outside)
  outside.remove()
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
  // Until the document resolves, the overlay says it is working.
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  await waitFor(() =>
    expect(container.querySelectorAll('.rfv__page')).toHaveLength(3),
  )
  expect(screen.getByText('1 / 3')).toBeInTheDocument()
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
})

test('an image the bucket cannot serve says so instead of a broken img', () => {
  const { container } = render(
    <ReceiptFileViewer
      url={URL}
      contentType="image/jpeg"
      pages={null}
      onClose={() => {}}
    />,
  )
  fireEvent.error(container.querySelector('.rfv__img')!)
  expect(screen.getByText('No se pudo cargar el ticket')).toBeInTheDocument()
  expect(container.querySelector('.rfv__img')).not.toBeInTheDocument()
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
