// Parse an instant the API sent.
//
// The API's timestamps are UTC. Older responses carry no offset at all, and
// a string with no offset would parse in the viewer's own zone, so a Z is
// added before parsing. A value that already names its zone is parsed as it
// is: adding a second suffix gives Invalid Date, and every comparison against
// that is silently false.
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

export function parseServerInstant(value: string): Date {
  return new Date(HAS_OFFSET.test(value) ? value : value + 'Z')
}

// Order two API instants, earliest first. Comparing the strings is not
// enough: a whole second prints no fraction, and '.' sorts before 'Z'.
export function compareServerInstants(a: string, b: string): number {
  return parseServerInstant(a).getTime() - parseServerInstant(b).getTime()
}
