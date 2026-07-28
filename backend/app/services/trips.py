"""Everything that knows what a shopping trip is.

Before this module, "is this purchase from today" was implemented five times —
twice in the frontend against the browser's local day, three times in the
backend against the UTC day. Three of the five were wrong, and they were wrong
in different directions, because the predicate had no home. It has one now.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import ListItem, Purchase  # noqa: F401 -- ListItem consumed by Task 4 (detach)

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
    """Is this trip still taking items?

    False once it was closed by hand, and false once it has torn off.
    """
    return ends_at(trip) > (now or _now())


def trip_for(session: Session, list_id: str, instant: datetime) -> Purchase:
    """The unreconciled trip for `instant`'s local day, created if absent.

    One rule for every tap, and the same rule the backfill uses — (list, local
    day). That is why an offline tap drained three days late files into that
    day's trip rather than into tonight's shop, and why two such taps find one
    trip instead of making two.

    The lookup keys on `tears_off_at` equality, which *is* the same-local-day
    test, so no date function appears in SQL and there is no dialect branch.

    For a past-or-present `instant`, a trip created for a past day is born
    already torn off, and that alone would keep "at most one open trip per
    list" true. It stops being true on a future `instant` — a fast-clock tap
    could compute tomorrow's `tears_off_at` while tonight's trip is still
    open — and it was never true against two members tapping at the same
    instant, who can both miss the SELECT below and both attempt the INSERT.
    The actual guarantee is the partial unique index
    `uq_purchases_open_per_list` (list_id, tears_off_at) WHERE closed_at IS
    NULL on `Purchase`, not this function's arithmetic. The `except
    IntegrityError` below is how the loser of that race is handed the
    winner's row instead of failing the tap.
    """
    tears_off = tears_off_at_for(instant)
    trip = session.exec(
        select(Purchase).where(
            Purchase.list_id == list_id,
            Purchase.closed_at.is_(None),
            Purchase.tears_off_at == tears_off,
        )
    ).first()
    if trip is None:
        trip = Purchase(list_id=list_id, opened_at=instant, tears_off_at=tears_off)
        try:
            with session.begin_nested():
                session.add(trip)
                # Forces the INSERT now, inside the savepoint, so a unique
                # violation raises here where it's caught rather than at
                # some later autoflush (autoflush=True everywhere, so this
                # isn't needed for the object to eventually get written —
                # only for the IntegrityError to land in this try block).
                session.flush()
        except IntegrityError:
            # Another member (or a retried request) tapped at the same
            # instant and won the insert under uq_purchases_open_per_list.
            # The savepoint rollback already leaves `trip` detached from the
            # session (observed empirically: an explicit session.expunge(trip)
            # here raises InvalidRequestError), so we don't repeat that call.
            # Read the row the winner created instead of failing this tap.
            return session.exec(
                select(Purchase).where(
                    Purchase.list_id == list_id,
                    Purchase.closed_at.is_(None),
                    Purchase.tears_off_at == tears_off,
                )
            ).one()
        return trip
    if instant < trip.opened_at:
        trip.opened_at = instant
        session.add(trip)
    return trip


def open_trip(session: Session, list_id: str, now: datetime | None = None) -> Purchase | None:
    """The list's live trip: unreconciled, and not yet torn off."""
    now = now or _now()
    return session.exec(
        select(Purchase).where(
            Purchase.list_id == list_id,
            Purchase.closed_at.is_(None),
            Purchase.tears_off_at > now,
        )
    ).first()
