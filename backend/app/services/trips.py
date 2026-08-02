"""Trip boundary arithmetic.

A trip's tear-off is the local midnight that ends the day it was opened on,
stamped onto the row at creation. The timezone is the caller's business: date
rules in this app follow the viewer's calendar day, resolved from the
X-Client-Timezone header (see ADR-012 and app.services.client_day). Nothing
here hardcodes a zone.
"""

from datetime import UTC, datetime, timedelta, tzinfo


def tears_off_at_for(instant: datetime, tz: tzinfo) -> datetime:
    """Naive-UTC instant of the local midnight after `instant`'s day in `tz`.

    `instant` is naive UTC, the way the database stores timestamps, and the
    result is too, so it compares directly against stored columns.
    """
    local = instant.replace(tzinfo=UTC).astimezone(tz)
    next_midnight = datetime.combine(
        local.date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=tz,
    )
    return next_midnight.astimezone(UTC).replace(tzinfo=None)
