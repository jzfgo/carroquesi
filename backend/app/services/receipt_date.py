"""Plausibility check for the day read off a receipt.

The parse misreads dates, most often the year: "26" read as "20" puts a
receipt six years back. A wrong day is not harmless. It aims a past-dated scan
at the wrong purchase and back-dates the trip the apply closes. So the scan
checks the day before anything uses it.

A plausible day is one between `PLAUSIBLE_PAST_DAYS` ago and today: a receipt
is printed when the shop happens and is scanned soon after. Outside that
window, the same day and month in the current or previous year is tried. Year
misreads are the common case, and there the repair is safe. The window is
shorter than a year, so at most one candidate can fall inside it. Anything
else is dropped, and the review asks for the date instead of guessing.
"""

from datetime import date, timedelta

# Long enough for a receipt found in a pocket weeks later. Must stay under a
# year, or two repair candidates could both be plausible.
PLAUSIBLE_PAST_DAYS = 90


def plausible_day(read: date, today: date) -> date | None:
    """The day the receipt was printed, repaired when it is safe, else None."""
    earliest = today - timedelta(days=PLAUSIBLE_PAST_DAYS)
    if earliest <= read <= today:
        return read
    for year in (today.year, today.year - 1):
        try:
            candidate = read.replace(year=year)
        except ValueError:
            # 29 February in a year without it: there is no such day to repair to.
            continue
        if earliest <= candidate <= today:
            return candidate
    return None
