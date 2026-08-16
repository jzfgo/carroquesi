let pdfjs: Promise<typeof import('pdfjs-dist')> | undefined

// Lazy and memoised, like the Firebase accessors: the library is large and
// only a PDF receipt ever needs it, so it must not ride in the main bundle.
// A failed load clears the memo so going back online lets a retry succeed.
export function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  return (pdfjs ??= load().catch((e: unknown) => {
    pdfjs = undefined
    throw e
  }))
}

async function load(): Promise<typeof import('pdfjs-dist')> {
  const [lib, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}
