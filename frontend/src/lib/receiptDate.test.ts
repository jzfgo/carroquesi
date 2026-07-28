import {
  RECEIPT_DATE_TOLERANCE_DAYS,
  isReceiptDateWorthConfirming,
  toDateInputValue,
  toLocalInstant,
  todayInputValue,
  withDatePart,
} from './receiptDate'

/**
 * Built from *local* components on purpose. These assertions are about the
 * viewer's calendar, so a fixture pinned to a UTC instant would only hold in
 * the timezone it was written in and quietly change meaning in CI.
 */
const NOW = new Date(2026, 6, 25, 12, 0, 0)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Calendar arithmetic on a zone-less day — no offset, so DST cannot bite. */
function daysFromNow(delta: number): string {
  const d = new Date(Date.UTC(2026, 6, 25) + delta * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** The instant `receiptAi.toReceiptInstant` would produce for a local moment. */
function instantAt(
  y: number,
  m: number,
  d: number,
  h: number,
  min = 0,
): string {
  return toLocalInstant(new Date(y, m - 1, d, h, min, 0, 0))
}

/**
 * The same moment written the way it used to be sent: flattened to UTC.
 *
 * Kept as a fixture rather than deleted, because older scans are stored in
 * this form and still come back through these functions.
 */
function utcInstantAt(
  y: number,
  m: number,
  d: number,
  h: number,
  min = 0,
): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString()
}

describe('isReceiptDateWorthConfirming', () => {
  test('today is not worth querying', () => {
    expect(isReceiptDateWorthConfirming(daysFromNow(0), NOW)).toBe(false)
  })

  test.each([-RECEIPT_DATE_TOLERANCE_DAYS, RECEIPT_DATE_TOLERANCE_DAYS])(
    'a date %d days away is inside the match window',
    (delta) => {
      expect(isReceiptDateWorthConfirming(daysFromNow(delta), NOW)).toBe(false)
    },
  )

  test.each([
    -(RECEIPT_DATE_TOLERANCE_DAYS + 1),
    RECEIPT_DATE_TOLERANCE_DAYS + 1,
  ])('a date %d days away is outside it', (delta) => {
    expect(isReceiptDateWorthConfirming(daysFromNow(delta), NOW)).toBe(true)
  })

  test('catches a misread day, not just a misread year', () => {
    // "2026-07-14" for "2026-07-11" empties the same window a wrong year does.
    expect(isReceiptDateWorthConfirming('2026-07-11', NOW)).toBe(true)
  })

  test('catches a misread month', () => {
    expect(isReceiptDateWorthConfirming('2026-06-25', NOW)).toBe(true)
  })

  test('catches the 2020 reading seen in production', () => {
    expect(isReceiptDateWorthConfirming('2020-07-24', NOW)).toBe(true)
  })

  test('still catches a future date if one slips past the scanning prompt', () => {
    expect(isReceiptDateWorthConfirming('2027-07-25', NOW)).toBe(true)
  })

  test.each([null, '', 'not-a-date'])('has nothing to query for %p', (raw) => {
    expect(isReceiptDateWorthConfirming(raw, NOW)).toBe(false)
  })

  test('a receipt from late last night is judged on its local day', () => {
    // 00:30 local is the previous day in UTC. Judged as UTC it would read as
    // one day further away than it is -- harmless here, but the same
    // reduction is what the editor pre-fills from, so it has to agree.
    expect(
      isReceiptDateWorthConfirming(instantAt(2026, 7, 25, 0, 30), NOW),
    ).toBe(false)
  })

  test('the verdict is stable across the local day it is evaluated on', () => {
    // A receipt sitting exactly on the threshold must not flip as the clock
    // moves through the viewer's day.
    const onThreshold = daysFromNow(RECEIPT_DATE_TOLERANCE_DAYS)
    expect(
      isReceiptDateWorthConfirming(onThreshold, new Date(2026, 6, 25, 0, 1)),
    ).toBe(
      isReceiptDateWorthConfirming(onThreshold, new Date(2026, 6, 25, 23, 59)),
    )
  })
})

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

/**
 * These run in whatever zone the machine is set to — CEST locally, UTC in CI —
 * so every assertion has to hold in both. The offset assertions are the ones
 * that discriminate: in UTC a local instant and a UTC instant name the same
 * wall-clock time and no test could tell them apart, but `toISOString()` ends
 * in 'Z' where this ends in '+00:00'. That difference survives the zone.
 */
describe('toLocalInstant', () => {
  const smallHours = new Date(2026, 6, 25, 0, 30, 0, 0)

  test("writes the viewer's own day, whatever UTC would call it", () => {
    expect(toLocalInstant(smallHours).slice(0, 10)).toBe('2026-07-25')
  })

  test('writes the wall-clock time, not the UTC one', () => {
    expect(toLocalInstant(smallHours).slice(11, 19)).toBe('00:30:00')
  })

  test('states the offset rather than folding it away', () => {
    // The whole point: a 'Z' string has already lost the day it was written
    // on, and the backend has no timezone to recover it from.
    expect(toLocalInstant(smallHours)).toMatch(/[+-]\d{2}:\d{2}$/)
  })

  test('still names the same instant it was given', () => {
    expect(new Date(toLocalInstant(smallHours)).getTime()).toBe(
      smallHours.getTime(),
    )
  })

  test('reduces back to the day it was written on', () => {
    // The round trip the sheet depends on: what is sent is what the editor
    // pre-fills and what the prompt is judged against.
    expect(toDateInputValue(toLocalInstant(smallHours))).toBe('2026-07-25')
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

  test('sends the day the user picked, as the day they picked', () => {
    // The bug: the correction was flattened to UTC before being sent, so a
    // shopper in Madrid picking the 25th sent "2026-07-24T22:00:00.000Z". The
    // backend has no zone to undo that with, and centred its +-3 day match
    // window on the 24th — spending a day of the tolerance that exists
    // because items get marked purchased *after* the receipt date.
    const corrected = withDatePart(instantAt(2026, 7, 14, 0, 0), '2026-07-25')
    expect(corrected.slice(0, 10)).toBe('2026-07-25')
    expect(corrected).toMatch(/[+-]\d{2}:\d{2}$/)
  })

  test('corrects a scan that was stored in the old UTC form', () => {
    // Older scans come back flattened; the correction still has to land on
    // the picked day rather than inheriting the old shape.
    const corrected = withDatePart(
      utcInstantAt(2026, 7, 14, 0, 30),
      '2026-07-25',
    )
    expect(corrected.slice(0, 10)).toBe('2026-07-25')
  })

  test('stays a bare date when the original was one', () => {
    expect(withDatePart('2026-07-14', '2026-07-11')).toBe('2026-07-11')
  })

  test('stays a bare date when there was no original', () => {
    expect(withDatePart(null, '2026-07-11')).toBe('2026-07-11')
  })
})
