"""Trip boundaries, and the one way a trip comes into being.

A trip's tear-off is the local midnight that ends the day it was opened on,
stamped onto the row at creation. The timezone is the caller's business: date
rules in this app follow the viewer's calendar day, resolved from the
X-Client-Timezone header (see ADR-012 and app.services.client_day). Nothing
here hardcodes a zone.
"""

from datetime import UTC, datetime, timedelta, tzinfo

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import Purchase


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


def ends_at(trip: Purchase) -> datetime:
    """When the trip stopped accepting items — closed by hand, or torn off."""
    return trip.closed_at or trip.tears_off_at


def is_open(trip: Purchase, now: datetime) -> bool:
    """Is this trip still taking items? Closing early wins over the tear-off."""
    return ends_at(trip) > now


def open_trip_for(session: Session, list_id: str, now: datetime, tz: tzinfo) -> Purchase:
    """The list's open trip — the cart — created if there is none.

    A trip is open while it is unreconciled and its tear-off is still ahead.
    More than one can qualify: a fast clock, or a timezone change between two
    taps, can leave an open trip with a boundary further out than the one
    `now` would compute. Ordering by the earliest boundary keeps the choice
    deterministic and stops such a stale future boundary from shadowing the
    trip that tears off first.

    Two members tapping at the same instant can both miss the SELECT and both
    attempt the INSERT. The real guarantee of "one open trip" is the partial
    unique index uq_purchases_open_per_list, not this function's lookup; the
    `except IntegrityError` hands the loser the winner's row instead of
    failing the tap.
    """
    lookup = (
        select(Purchase)
        .where(
            Purchase.list_id == list_id,
            Purchase.closed_at.is_(None),
            Purchase.tears_off_at > now,
        )
        .order_by(Purchase.tears_off_at.asc())
    )
    trip = session.exec(lookup).first()
    if trip is not None:
        return trip
    trip = Purchase(list_id=list_id, opened_at=now, tears_off_at=tears_off_at_for(now, tz))
    try:
        # The SELECT above runs *before* this savepoint opens, and with
        # autoflush it flushes whatever the caller changed (update_item sets
        # purchased_at before calling in) into the outer transaction first.
        # That ordering is load-bearing: if the savepoint rolls back on a
        # lost race, it only discards the INSERT it made, never the caller's
        # already-flushed write. Moving the SELECT after begin_nested(), or
        # disabling autoflush, would let a lost race roll back the caller's
        # pending write too.
        with session.begin_nested():
            session.add(trip)
            # Forces the INSERT now, inside the savepoint, so a unique
            # violation raises here where it is caught rather than at some
            # later autoflush.
            session.flush()
    except IntegrityError:
        # Another member won the insert under uq_purchases_open_per_list.
        # Read the row the winner created instead of failing this tap.
        #
        # The re-select assumes READ COMMITTED (the deployed default): it
        # must be able to see a row committed after this transaction began.
        # Under REPEATABLE READ it would see a pre-savepoint snapshot and
        # find nothing despite the winner's row existing.
        #
        # `.first()` rather than `.one()`: IntegrityError covers *any*
        # constraint violation in the savepoint, not only the race. When the
        # re-select finds nothing, re-raising surfaces an unrelated failure
        # (a FK violation, say) as itself instead of a confusing empty
        # result.
        winner = session.exec(lookup).first()
        if winner is None:
            raise
        return winner
    return trip
