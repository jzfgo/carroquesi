from datetime import date

import pytest

from app.services.receipt_date import plausible_day

TODAY = date(2026, 11, 4)


@pytest.mark.parametrize(
    ("read", "expected"),
    [
        # Inside the window: kept as read.
        (date(2026, 11, 4), date(2026, 11, 4)),
        (date(2026, 10, 30), date(2026, 10, 30)),
        (date(2026, 8, 6), date(2026, 8, 6)),  # exactly 90 days back
        # A misread year with a plausible day/month: repaired to this year.
        (date(2020, 10, 30), date(2026, 10, 30)),
        (date(2062, 10, 30), date(2026, 10, 30)),
        (date(2027, 11, 1), date(2026, 11, 1)),
        # Same day/month is still ahead this year, but last year's falls outside
        # the window: nothing safe to repair to.
        (date(2020, 12, 30), None),
        # Same day/month far back in both candidate years.
        (date(2020, 3, 15), None),
        # Correct year, just old: dropped, the review asks.
        (date(2026, 8, 5), None),
        # Future in the right year: no repair makes it plausible.
        (date(2026, 11, 5), None),
    ],
)
def test_plausible_day(read, expected):
    assert plausible_day(read, TODAY) == expected


def test_repairs_into_the_previous_year_across_new_year():
    # Scanned on 3 Jan, read as 2020-12-30: this year's 30 Dec is ahead, last
    # year's is four days back.
    assert plausible_day(date(2020, 12, 30), date(2026, 1, 3)) == date(2025, 12, 30)


def test_29_february_skips_a_year_without_it():
    # 2026 has no 29 Feb; 2025 neither; nothing to repair to.
    assert plausible_day(date(2024, 2, 29), date(2026, 3, 1)) is None
    # 2028 has one and it is in the window.
    assert plausible_day(date(2024, 2, 29), date(2028, 3, 1)) == date(2028, 2, 29)
