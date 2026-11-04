import { toDateInputValue, todayInputValue, withDatePart } from './receiptDate'

/** The instant `receiptAi.toReceiptInstant` would produce for a local moment. */
function instantAt(
  y: number,
  m: number,
  d: number,
  h: number,
  min = 0,
): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString()
}

describe('toDateInputValue', () => {
  test('renders a bare date unchanged', () => {
    expect(toDateInputValue('2026-04-11')).toBe('2026-04-11')
  })

  test('drops the time from a full instant', () => {
    expect(toDateInputValue(instantAt(2026, 4, 11, 17, 42))).toBe('2026-04-11')
  })

  test('pre-fills the day the sheet displays, for a small-hours receipt', () => {
    // The regression: `receipt_date` is a UTC instant, so slicing it gave the
    // previous day for anything bought just after local midnight -- the button
    // read "25 abr" while the editor offered the 24th.
    expect(toDateInputValue(instantAt(2026, 4, 25, 0, 30))).toBe('2026-04-25')
  })

  test('pre-fills the displayed day for a late-evening receipt too', () => {
    // The mirror case, for viewers west of Greenwich.
    expect(toDateInputValue(instantAt(2026, 4, 25, 23, 30))).toBe('2026-04-25')
  })

  test.each([null, '', 'not-a-date'])('is empty for %p', (raw) => {
    expect(toDateInputValue(raw)).toBe('')
  })
})

describe('todayInputValue', () => {
  test("is the viewer's own calendar day, not the UTC one", () => {
    expect(todayInputValue(new Date(2026, 6, 25, 0, 30))).toBe('2026-07-25')
    expect(todayInputValue(new Date(2026, 6, 25, 23, 30))).toBe('2026-07-25')
  })
})

describe('withDatePart', () => {
  test('keeps the time of day when the original had one', () => {
    const corrected = withDatePart(instantAt(2026, 7, 14, 17, 42), '2026-07-11')
    const asDate = new Date(corrected)
    expect(asDate.getHours()).toBe(17)
    expect(asDate.getMinutes()).toBe(42)
  })

  test('lands on the day the user picked, not a day later', () => {
    // The regression: splicing the *UTC* time onto the chosen day pushed a
    // 00:30 receipt (stored as the previous day at 22:30Z) forward by one.
    const corrected = withDatePart(instantAt(2026, 7, 14, 0, 30), '2026-07-25')
    expect(toDateInputValue(corrected)).toBe('2026-07-25')
  })

  test('lands on the picked day for a late-evening receipt too', () => {
    const corrected = withDatePart(instantAt(2026, 7, 14, 23, 30), '2026-07-25')
    expect(toDateInputValue(corrected)).toBe('2026-07-25')
  })

  test('stays a bare date when the original was one', () => {
    expect(withDatePart('2026-07-14', '2026-07-11')).toBe('2026-07-11')
  })

  test('stays a bare date when there was no original', () => {
    expect(withDatePart(null, '2026-07-11')).toBe('2026-07-11')
  })
})
