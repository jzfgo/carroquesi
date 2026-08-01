"""same_client_day and the X-Client-Timezone resolver.

The mismatch between a UTC day and the viewer's day is signed, and each
sign wrongs a different user: an eastern viewer is refused an action on
something they did this morning, a western viewer is allowed one on
something they did yesterday evening. Both signs are pinned here with an
explicit `now`, because a test that reads the wall clock can only ever
see the sign its own timezone and hour happen to produce.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.services.client_day import resolve_timezone, same_client_day

MADRID = ZoneInfo("Europe/Madrid")
NEW_YORK = ZoneInfo("America/New_York")


def test_post_midnight_madrid_purchase_is_still_the_viewers_today():
    # 22:30 UTC on the 24th is 00:30 on the 25th in Madrid (summer, UTC+2).
    purchased = datetime(2026, 7, 24, 22, 30)
    now = datetime(2026, 7, 25, 8, 0)  # 10:00 in Madrid, later the same local day
    assert same_client_day(purchased, MADRID, now=now) is True
    # The UTC reduction refuses this user an action on this morning's purchase.
    assert same_client_day(purchased, UTC, now=now) is False


def test_new_york_evening_purchase_is_not_the_viewers_today_anymore():
    # 01:00 UTC on the 25th is 21:00 on the 24th in New York (summer, UTC-4).
    purchased = datetime(2026, 7, 25, 1, 0)
    now = datetime(2026, 7, 25, 14, 0)  # 10:00 on the 25th in New York
    assert same_client_day(purchased, NEW_YORK, now=now) is False
    # The UTC reduction lets this user rewrite yesterday evening's record.
    assert same_client_day(purchased, UTC, now=now) is True


def test_same_utc_day_stays_same_in_utc():
    purchased = datetime(2026, 7, 25, 9, 0)
    now = datetime(2026, 7, 25, 14, 0)
    assert same_client_day(purchased, UTC, now=now) is True


def test_missing_timezone_resolves_to_utc():
    assert resolve_timezone(None) is UTC


def test_unknown_timezone_resolves_to_utc():
    assert resolve_timezone("Not/AZone") is UTC


def test_malformed_timezone_resolves_to_utc():
    assert resolve_timezone("../etc/passwd") is UTC


def test_valid_timezone_resolves_to_itself():
    assert resolve_timezone("Europe/Madrid") == ZoneInfo("Europe/Madrid")
