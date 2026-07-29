"""Everything that knows what a shopping trip is.

Before this module, "is this purchase from today" was implemented six times —
three in the frontend, three in the backend. Four compared the UTC day when the
boundary that matters is Madrid local midnight, and they were wrong in
different directions, because the predicate had no home. It has one now.

The inventory was itself incomplete when this module was written: it found
five. The sixth was the dashboard's progress counts in routers/lists.py, spelled
`func.date(purchased_at) == func.current_date()` — the same rule in SQL, which a
grep for Python date arithmetic could not see. That an audit of the duplication
missed a sixth of it is the argument for keeping the rule here, not a footnote
to it.
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
            # The SELECT above runs *before* this savepoint opens, and with
            # autoflush that SELECT flushes whatever the caller changed on
            # `item` (e.g. update_item setting purchased_at/purchase_id
            # before calling attach()) into the outer transaction first. That
            # ordering is load-bearing: if the savepoint below rolls back on
            # a lost race, it only ever discards the INSERT it made, never
            # the caller's already-flushed UPDATE. Moving the SELECT after
            # `begin_nested()` opens, or disabling autoflush, would let a
            # lost race roll back the caller's pending write too -- see
            # test_losing_the_race_does_not_revert_the_callers_pending_item
            # in test_trips.py, which pins this ordering directly.
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
            #
            # This re-select assumes READ COMMITTED: it must be able to see a
            # row the winner's own transaction has not committed yet from our
            # point of view being possible, i.e. that our transaction isn't
            # isolated from writes that landed after it started. That's
            # Postgres's default and is what's deployed, but it is not true
            # under REPEATABLE READ, where this SELECT would see a
            # pre-savepoint snapshot and find nothing despite the winner's row
            # existing. Written down here because nothing else pins it.
            #
            # `.first()` rather than `.one()`, deliberately: `IntegrityError`
            # is raised by *any* constraint violation in this savepoint, not
            # only the unique-race this comment describes -- a `list_id` FK
            # violation, say. Re-raising when the re-select comes up empty
            # means an unrelated integrity failure surfaces as itself instead
            # of a confusing NoResultFound.
            winner = session.exec(
                select(Purchase).where(
                    Purchase.list_id == list_id,
                    Purchase.closed_at.is_(None),
                    Purchase.tears_off_at == tears_off,
                )
            ).first()
            if winner is None:
                raise
            return winner
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


# How far back a client-supplied tap time may reach. Long enough for a phone
# that was offline over a holiday, short enough that a broken clock cannot
# invent a trip in another year.
MAX_BACKDATE = timedelta(days=30)


def no_future(supplied: datetime, now: datetime) -> datetime:
    """Refuse an instant later than `now` — the one rule every purchase
    timestamp must obey, no matter which router is asking.

    Deliberately just the upper bound. There is no tolerance for a fast
    client clock: five minutes of slack lets a tap at 23:57 Madrid arrive
    claiming 00:02, which computes *tomorrow's* tear-off while tonight's trip
    is still open — two trips would then satisfy "unreconciled and not yet
    torn off" and open_trip() would pick one arbitrarily. There is no such
    thing as a purchase in the future, so the server's clock wins.

    No lower bound here on purpose — that is what distinguishes this from
    `tap_time`. A live tap's clock can be wrong in a way a receipt's date
    cannot: a receipt is a record of something that already happened, however
    long ago, and a shopper scanning a receipt found in a drawer is not a
    broken clock. Bounding this the same way `tap_time` bounds a tap would
    silently move `purchased_at` for any receipt older than `MAX_BACKDATE`,
    which is exactly the reconciliation this endpoint exists to do correctly.
    """
    if supplied.tzinfo is not None:
        supplied = supplied.astimezone(UTC).replace(tzinfo=None)
    return min(supplied, now)


def tap_time(supplied: datetime | None, now: datetime) -> datetime:
    """The instant to file a *live* purchase tap under, clamped against a
    wrong clock in both directions.

    The upper bound is `no_future` — see its docstring for why that direction
    is load-bearing rather than fussy. The lower bound, `MAX_BACKDATE`, is
    specific to a tap: a phone can be offline over a holiday and drain a
    backdated tap late, but there's a limit to how late before it's more
    likely a broken clock than a real gap, and past that a bad timestamp
    could invent a trip in another year.

    Lives here, not in a router, because both routers that accept a
    client-supplied purchase instant — items.py's manual purchase-toggle and
    receipt.py's apply-receipt-prices — must apply the future bound the same
    way. A copy living in one router is a copy the other one can silently
    skip, which is exactly how a receipt date misread by OCR used to create a
    future-dated trip alongside the live cart. The receipt path calls
    `no_future` directly instead of this function precisely because it must
    *not* inherit the backdate floor below — see `no_future`'s docstring.
    """
    if supplied is None:
        return now
    return max(no_future(supplied, now), now - MAX_BACKDATE)


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
    # different ticket. (The split branch below also recomputes `trip`'s own
    # opened_at directly, for the moment the split happens rather than only
    # the next time this trip is closed -- the two recomputations cover the
    # eager and the lazy case, and either one alone leaves a window where the
    # remainder's opened_at is stale.) The fallback to trip.opened_at is
    # unreachable in practice -- every item is stamped with purchased_at
    # before attach() ever puts it in a trip -- but if it ever fired, it
    # would mean an item without a purchase timestamp made it into the cart,
    # and falling back to the trip's own opened_at is the least-wrong thing
    # to do rather than crashing.
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

    # The remainder -- what stays behind in `trip`, still open -- needs its
    # own opened_at recomputed too, for the same reason `opened_at` above is
    # computed from `selection` rather than trusted as `trip.opened_at`:
    # whichever item happened to be earliest may just have left for `split`.
    # Left alone, `trip.opened_at` would keep claiming a start time that now
    # belongs to a different ticket -- self-correcting the next time this
    # trip is closed (since `opened_at` above is always recomputed from
    # whatever's still selected then), but wrong in the meantime.
    remaining = [item for item in cart if item not in selection]
    trip.opened_at = min(
        (item.purchased_at for item in remaining if item.purchased_at), default=trip.opened_at
    )
    session.add(trip)

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
    several — scan_receipt matches across a ±3 day window, with no trip
    filter, so a scan routinely matches items already filed under different
    trips (an older closed ticket, a still-open cart, both). A scan reconciles
    a trip only when *every* affected item belongs to that one trip; checking
    the spread only among the items not already in the live cart (as an
    earlier version of this did) let a receipt whose total covers several
    lines attach in full to whichever one of those lines happened to still be
    in the open trip -- one paper total, several ticket totals, all of them
    now claiming it. Guessing which trip a receipt "meant" would be inventing
    a fact, so a spread scan reconciles nothing: the affected items are left
    exactly where they were, for a manual close.
    """
    now = now or _now()
    trip_ids = {item.purchase_id for item in items if item.purchase_id}
    if len(trip_ids) != 1:
        return None
    trip = session.get(Purchase, trip_ids.pop())
    if trip is None:
        return None

    live = open_trip(session, list_id, now)
    if live is not None and trip.id == live.id:
        in_trip = [item.id for item in items if item.purchase_id == trip.id]
        return close(session, list_id, in_trip, store, total, now)

    # Every affected item sits on one trip that isn't the live cart. Two ways
    # to get here: the trip is already closed (by hand, or by an earlier
    # scan) and this is a repeat or corroborating application -- confirmed
    # values must not be touched -- or the trip tore off with nobody having
    # said what it was. In that second case confirming *is* closing: leaving
    # closed_at NULL would let trip_for's `closed_at IS NULL` lookup hand a
    # later backdated tap for the same day this same trip, silently adding a
    # line the confirmed total never covered. The `closed_at is None` guard
    # below is what tells the two cases apart -- fill in what was never said
    # and close it in the second, touch nothing in the first.
    if trip.closed_at is None:
        if trip.store is None:
            trip.store = store
        if trip.total is None:
            trip.total = total
        trip.closed_at = now
        session.add(trip)
    return trip
