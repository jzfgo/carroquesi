"""Everything that knows what a shopping trip is.

Before this module, "is this purchase from today" was implemented five times —
twice in the frontend against the browser's local day, three times in the
backend against the UTC day. Three of the five were wrong, and they were wrong
in different directions, because the predicate had no home. It has one now.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, select  # noqa: F401 -- consumed by Task 3 (finding trips)

from app.db.models import ListItem, Purchase  # noqa: F401 -- ListItem consumed by Task 3

# The trip boundary. There is no per-user timezone anywhere, and on a shared
# list "the local day the person lived through" has no single answer — which
# person? A trip is a household fact, so the household's zone decides it, not
# whichever member's phone is in an airport.
TRIP_TIMEZONE = ZoneInfo("Europe/Madrid")


def tears_off_at_for(instant: datetime) -> datetime:
    """Naive-UTC instant of the local midnight that ends `instant`'s trip day.

    `instant` is naive UTC, which is what the database stores throughout.
    """
    local = instant.replace(tzinfo=UTC).astimezone(TRIP_TIMEZONE)
    next_midnight = datetime.combine(
        local.date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=TRIP_TIMEZONE,
    )
    return next_midnight.astimezone(UTC).replace(tzinfo=None)


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def ends_at(trip: Purchase) -> datetime:
    """When the trip stopped accepting items — deliberately, or by tearing off."""
    return trip.closed_at or trip.tears_off_at


def is_open(trip: Purchase, now: datetime | None = None) -> bool:
    return ends_at(trip) > (now or _now())
