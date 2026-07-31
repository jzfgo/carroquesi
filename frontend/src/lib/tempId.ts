/**
 * The id a row carries between being typed and being created.
 *
 * This is about *latency*, not connectivity: `addItem` paints its row before
 * the POST answers, and that row needs an id to be keyed and tapped by. It
 * outlived the offline queue, which is why it lives here rather than in it —
 * with no signal there is no optimistic add at all, because the write is
 * refused before the paint.
 *
 * A row is still fully interactive under one of these while its POST is
 * merely slow, and every mutation reads the id straight off it. See JAV-97:
 * that is a real gap and this file is not where it gets closed.
 */
export function newTempId(): string {
  return `tmp-${crypto.randomUUID()}`
}

export function isTempId(id: string): boolean {
  return id.startsWith('tmp-')
}
