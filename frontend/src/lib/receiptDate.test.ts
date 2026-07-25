import {
  RECEIPT_DATE_TOLERANCE_DAYS,
  isReceiptDateWorthConfirming,
  toDateInputValue,
  withDatePart,
} from './receiptDate'

const NOW = new Date('2026-07-25T12:00:00Z')

function daysFromNow(delta: number): string {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
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

  test('a full instant is judged on its date alone', () => {
    expect(isReceiptDateWorthConfirming('2026-07-25T23:59:00Z', NOW)).toBe(
      false,
    )
  })

  test('the verdict does not depend on the time of day it is evaluated', () => {
    // Both sides reduce to UTC days, so a receipt sitting on the threshold
    // must not flip as the clock moves through the day.
    const onThreshold = daysFromNow(RECEIPT_DATE_TOLERANCE_DAYS)
    expect(
      isReceiptDateWorthConfirming(
        onThreshold,
        new Date('2026-07-25T00:00:01Z'),
      ),
    ).toBe(
      isReceiptDateWorthConfirming(
        onThreshold,
        new Date('2026-07-25T23:59:59Z'),
      ),
    )
  })
})

describe('toDateInputValue', () => {
  test('renders a bare date unchanged', () => {
    expect(toDateInputValue('2026-04-11')).toBe('2026-04-11')
  })

  test('drops the time from a full instant', () => {
    expect(toDateInputValue('2026-04-11T17:42:00Z')).toBe('2026-04-11')
  })

  test.each([null, '', 'not-a-date'])('is empty for %p', (raw) => {
    expect(toDateInputValue(raw)).toBe('')
  })
})

describe('withDatePart', () => {
  test('keeps the time of day when the original had one', () => {
    expect(withDatePart('2026-07-14T17:42:00Z', '2026-07-11')).toBe(
      '2026-07-11T17:42:00Z',
    )
  })

  test('stays a bare date when the original was one', () => {
    expect(withDatePart('2026-07-14', '2026-07-11')).toBe('2026-07-11')
  })

  test('stays a bare date when there was no original', () => {
    expect(withDatePart(null, '2026-07-11')).toBe('2026-07-11')
  })
})
