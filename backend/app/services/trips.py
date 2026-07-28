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

from app.db.models import ListItem, Purchase

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


class AlreadyFiled(Exception):
    """Raised by `attach` when the item's current trip is already closed.

    A closed trip's total is a fact someone read off a receipt, not a sum
    computed from its lines. Move a line out from under it and the ticket
    keeps claiming a total its contents no longer add up to, silently -- the
    same collapse the spec calls out for merging `Purchase` into
    `ReceiptScan`. So a closed trip's lines do not move, full stop.
    """


def attach(session: Session, item: ListItem, instant: datetime) -> Purchase:
    """Put a just-purchased item into the trip its timestamp belongs to.

    If the item is already attached to a different *open* trip -- a
    correction, or a backdated offline tap draining in after today's tap
    already attached it -- it is moved, and the old trip is cleaned up
    exactly the way `detach` would clean it up. Otherwise a re-tap could
    leave an orphan open trip behind.

    Raises `AlreadyFiled` instead, without touching anything, if the item's
    current trip is closed. `trip_for` never returns a closed trip, so the
    resolved trip is guaranteed to differ from a closed current one --
    there's no same-trip case to special-case here, only the moved-or-not
    branch below, which this guard must run ahead of.
    """
    if item.purchase_id is not None:
        current = session.get(Purchase, item.purchase_id)
        if current is not None and current.closed_at is not None:
            raise AlreadyFiled()
    trip = trip_for(session, item.list_id, instant)
    if item.purchase_id is not None and item.purchase_id != trip.id:
        detach(session, item)
    item.purchase_id = trip.id
    session.add(item)
    return trip


def detach(session: Session, item: ListItem) -> None:
    """Take an item back out of its trip.

    An open trip with nothing left in it is not a fact about anything, so it
    goes. A closed one stays: it holds a store and a total someone confirmed,
    and those outlive the lines.
    """
    trip_id = item.purchase_id
    item.purchase_id = None
    session.add(item)
    if trip_id is None:
        return
    session.flush()
    trip = session.get(Purchase, trip_id)
    if trip is None or trip.closed_at is not None:
        return
    remaining = session.exec(select(ListItem).where(ListItem.purchase_id == trip_id)).first()
    if remaining is None:
        session.delete(trip)


class NothingToClose(Exception):
    """No open trip, or an empty cart. Closing nothing is not a thing that happened."""


class NotInTheCart(Exception):
    """A named item is not in the trip being closed."""


def close(
    session: Session,
    list_id: str,
    item_ids: list[str] | None,
    store: str | None,
    total: float | None,
    now: datetime | None = None,
) -> Purchase:
    """Declare what a shop was.

    This is the act that creates a ticket. Tapping only puts things in the
    cart; reconciling — here, or by scanning a receipt — is what says "these
    lines, that shop, this total". Because it takes a *subset*, two people who
    shopped at two shops on one evening each get their own ticket.
    """
    now = now or _now()
    trip = open_trip(session, list_id, now)
    if trip is None:
        raise NothingToClose()

    cart = list(session.exec(select(ListItem).where(ListItem.purchase_id == trip.id)).all())
    if not cart:
        raise NothingToClose()

    if item_ids is None:
        selection = cart
    else:
        wanted = set(item_ids)
        selection = [item for item in cart if item.id in wanted]
        if len(selection) != len(wanted):
            raise NotInTheCart()
    if not selection:
        raise NothingToClose()

    # A trip's opened_at is when *its own* shopping started, not when the
    # cart it was carved out of first got a tap. Recomputing it here from the
    # selection -- rather than only in the split branch -- matters for the
    # in-place branch too: close the remainder of a cart after an earlier
    # split closed off its first few items, and without this the remainder's
    # opened_at would still be the original tap time, which now belongs to a
    # different ticket. The fallback to trip.opened_at is unreachable in
    # practice -- every item is stamped with purchased_at before attach() ever
    # puts it in a trip -- but if it ever fired, it would mean an item without
    # a purchase timestamp made it into the cart, and falling back to the
    # trip's own opened_at is the least-wrong thing to do rather than crashing.
    opened_at = min(
        (item.purchased_at for item in selection if item.purchased_at), default=trip.opened_at
    )

    if len(selection) == len(cart):
        trip.opened_at = opened_at
        trip.closed_at = now
        trip.store = store
        trip.total = total
        session.add(trip)
        return trip

    split = Purchase(
        list_id=list_id,
        opened_at=opened_at,
        tears_off_at=trip.tears_off_at,
        closed_at=now,
        store=store,
        total=total,
    )
    session.add(split)
    session.flush()
    for item in selection:
        item.purchase_id = split.id
        session.add(item)
    return split


def reconcile_scan(
    session: Session,
    list_id: str,
    items: list[ListItem],
    store: str | None,
    total: float | None,
    now: datetime | None = None,
) -> Purchase | None:
    """Applying a receipt is a reconciliation, exactly like closing by hand.

    Returns the trip the scan reconciled, or None when the matches spanned
    several — scan_receipt matches across a ±3 day window, so that is
    reachable, and guessing which of several trips a receipt "meant" would be
    inventing a fact.
    """
    now = now or _now()
    live = open_trip(session, list_id, now)
    in_cart = [item for item in items if live and item.purchase_id == live.id]
    if in_cart:
        return close(session, list_id, [item.id for item in in_cart], store, total, now)

    trip_ids = {item.purchase_id for item in items if item.purchase_id}
    if len(trip_ids) != 1:
        return None
    trip = session.get(Purchase, trip_ids.pop())
    if trip is None:
        return None
    # The scan is confirming a trip that tore off unreconciled. Fill in what
    # was never said; never overwrite what was.
    if trip.store is None:
        trip.store = store
    if trip.total is None:
        trip.total = total
    session.add(trip)
    return trip
