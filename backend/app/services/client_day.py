"""The viewer's calendar day, for date-based guards.

Date rules in this app are about the day the user lived through, not the
UTC day the server stores. A browser declares its IANA timezone in the
X-Client-Timezone header; a client that sends none, or one the server
does not know, is judged in UTC. The header is trusted: these guards
protect against accidents, not adversaries, and every caller could reach
the data through other writes anyway. See ADR-012.
"""

from datetime import UTC, datetime, tzinfo
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, Header


def resolve_timezone(
    x_client_timezone: Annotated[str | None, Header()] = None,
) -> tzinfo:
    if not x_client_timezone:
        return UTC
    try:
        return ZoneInfo(x_client_timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return UTC


ClientTimezone = Annotated[tzinfo, Depends(resolve_timezone)]


def same_client_day(instant: datetime, tz: tzinfo, now: datetime | None = None) -> bool:
    """Whether a stored instant falls on the client's current calendar day.

    Both `instant` and `now` are naive UTC, the way the database stores
    timestamps. `now` is injectable so tests can pin the clock.
    """
    if now is None:
        now = datetime.now(UTC).replace(tzinfo=None)
    instant_day = instant.replace(tzinfo=UTC).astimezone(tz).date()
    today = now.replace(tzinfo=UTC).astimezone(tz).date()
    return instant_day == today
