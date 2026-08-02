"""Trip boundaries, how a trip comes into being, and how one is closed.

A trip's tear-off is the local midnight that ends the day it was opened on,
stamped onto the row at creation. The timezone is the caller's business: date
rules in this app follow the viewer's calendar day, resolved from the
X-Client-Timezone header (see ADR-012 and app.services.client_day). Nothing
here hardcodes a zone.
"""

from datetime import UTC, datetime, timedelta, tzinfo

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import ListItem, Purchase


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


class NothingToClose(Exception):
    """No trip to close, or nothing claimed from it.

    Also raised when a named purchase_id matches no row, names a trip on
    another list, or names one already reconciled. That last case is not
    "nothing": the trip exists and holds a total someone confirmed for the
    lines it held then. Closing it again would attach that figure to a
    different set of lines.
    """


class NotInTheCart(Exception):
    """A claimed item is not in the trip being closed."""


def close(
    session: Session,
    list_id: str,
    item_ids: list[str],
    store: str,
    total: float | None,
    now: datetime,
    purchase_id: str | None = None,
) -> Purchase:
    """Declare what a shop was — the act that turns a cart into a ticket.

    Tapping only puts items into the open trip; closing claims a subset of
    that cart and says "these lines, that shop, this total". Claiming every
    item closes the trip in place. Claiming fewer splits the selection off
    into a new trip, born closed, and leaves the remainder open — which is
    how two shops on one evening end up with a ticket each. No branch ever
    leaves an empty open trip behind: the in-place close takes the whole
    cart with it, and a split keeps at least one item on the open side.

    `purchase_id` names which trip to close; without it the target is the
    open cart. Naming is how a trip that tore off at midnight with nobody
    saying what it was gets written down the next morning.
    """
    if purchase_id is not None:
        # A filtered SELECT rather than session.get: a caller that already
        # read this row holds it in the identity map, and get() would answer
        # from there — a second member's close, committed in the meantime,
        # would be invisible and its confirmed total silently overwritten.
        # The filter forces a round trip that sees the newer commit and turns
        # it into a refusal.
        #
        # Like open_trip_for's re-select, this assumes READ COMMITTED (the
        # deployed default): the SELECT must see a row version committed
        # after this transaction began. Under REPEATABLE READ it reads a
        # stale snapshot and the refusal silently stops firing; for the
        # in-place branch the conditional UPDATE below is the backstop.
        trip = session.exec(
            select(Purchase).where(
                Purchase.id == purchase_id,
                Purchase.list_id == list_id,
                Purchase.closed_at.is_(None),
            )
        ).first()
    else:
        # The open cart: the same lookup open_trip_for resolves taps with,
        # minus the create — a shop that never happened cannot be closed.
        trip = session.exec(
            select(Purchase)
            .where(
                Purchase.list_id == list_id,
                Purchase.closed_at.is_(None),
                Purchase.tears_off_at > now,
            )
            .order_by(Purchase.tears_off_at.asc())
        ).first()
    if trip is None:
        raise NothingToClose()

    cart = list(session.exec(select(ListItem).where(ListItem.purchase_id == trip.id)).all())
    wanted = set(item_ids)
    selection = [item for item in cart if item.id in wanted]
    if len(selection) != len(wanted):
        # An id that is not in this trip's cart — unknown, another list's, or
        # already filed on another ticket. Skipping it silently would file a
        # different sheet than the one the caller sent.
        raise NotInTheCart()
    if not selection:
        raise NothingToClose()

    # A ticket's opened_at is when its own shopping started, and the earliest
    # claimed tap is that instant. The fallback only fires if an item reached
    # the cart without a purchase timestamp, which no write path produces;
    # the trip's own opened_at is then the least-wrong answer.
    opened_at = min(
        (item.purchased_at for item in selection if item.purchased_at is not None),
        default=trip.opened_at,
    )

    if len(selection) == len(cart):
        # In place, and conditionally: the resolving SELECT above only
        # refuses a close that committed before it ran. One that commits
        # between that SELECT and this statement would be overwritten by a
        # plain assignment, so the WHERE re-checks the row as it stands and
        # zero rows updated means another member's close already won.
        claimed = session.execute(
            update(Purchase)
            .where(Purchase.id == trip.id, Purchase.closed_at.is_(None))
            .values(opened_at=opened_at, closed_at=now, store=store, total=total)
        )
        if claimed.rowcount == 0:
            raise NothingToClose()
        session.expire(trip)
        return trip

    # The split: the selection leaves for a new trip born closed, and the
    # remainder stays behind, still open. This branch has no conditional
    # write — it never files `trip`, only moves items off it — so its
    # protection against a concurrent close is the resolving SELECT alone.
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
    # Whichever tap happened first may just have left for the new ticket;
    # without this the remainder keeps claiming a start time that no longer
    # belongs to it.
    trip.opened_at = min(
        (item.purchased_at for item in cart if item.id not in wanted and item.purchased_at),
        default=trip.opened_at,
    )
    session.add(trip)
    return split
