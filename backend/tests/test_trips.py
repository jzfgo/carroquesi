import warnings
from datetime import datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError, SAWarning
from sqlmodel import Session, select

from app.db.models import List, ListItem, Purchase, User
from app.services import trips


def test_a_purchase_belongs_to_a_list_and_records_its_boundary(session: Session, user: User):
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()

    trip = Purchase(
        list_id=lst.id,
        opened_at=datetime(2026, 7, 28, 16, 0),
        tears_off_at=datetime(2026, 7, 28, 22, 0),
    )
    session.add(trip)
    session.commit()
    session.refresh(trip)

    assert trip.closed_at is None
    assert trip.store is None
    assert trip.total is None

    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id, purchase_id=trip.id)
    session.add(item)
    session.commit()
    session.refresh(item)

    assert item.purchase_id == trip.id


def test_a_trip_cannot_exist_without_a_boundary(session: Session, user: User):
    """tears_off_at has no default, deliberately.

    Every consumer of a trip reads this instant to decide whether the trip is
    still open. A default would stamp a boundary nobody computed and they would
    all believe it, so the absence of one is the invariant worth locking down.
    """
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()

    session.add(Purchase(list_id=lst.id, opened_at=datetime(2026, 7, 28, 16, 0)))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_tear_off_is_the_next_madrid_midnight_in_naive_utc():
    # Summer: Madrid is UTC+2, so local midnight on the 29th is 22:00Z on the 28th.
    assert trips.tears_off_at_for(datetime(2026, 7, 28, 16, 0)) == datetime(2026, 7, 28, 22, 0)


def test_a_late_evening_shop_belongs_to_the_day_it_was_lived_through():
    # 23:30 Madrid on the 28th is 21:30Z — the same UTC day, but the point is
    # that grouping on the UTC day would have called this the 28th's *shop*
    # only by luck. 00:30 Madrid on the 29th is 22:30Z on the 28th, and must
    # tear off a day later than the 21:30Z one.
    assert trips.tears_off_at_for(datetime(2026, 7, 28, 21, 30)) == datetime(2026, 7, 28, 22, 0)
    assert trips.tears_off_at_for(datetime(2026, 7, 28, 22, 30)) == datetime(2026, 7, 29, 22, 0)


def test_winter_offset_is_one_hour():
    assert trips.tears_off_at_for(datetime(2026, 1, 15, 10, 0)) == datetime(2026, 1, 15, 23, 0)


def test_the_spring_forward_day_is_twenty_three_hours_long():
    # 2026-03-29 is the DST change in Spain: 02:00 becomes 03:00.
    start = trips.tears_off_at_for(datetime(2026, 3, 28, 12, 0))
    end = trips.tears_off_at_for(datetime(2026, 3, 29, 12, 0))
    assert (end - start).total_seconds() == 23 * 3600


def test_the_autumn_back_day_is_twenty_five_hours_long():
    # 2026-10-25 is the DST change in Spain: 03:00 becomes 02:00.
    start = trips.tears_off_at_for(datetime(2026, 10, 24, 12, 0))
    end = trips.tears_off_at_for(datetime(2026, 10, 25, 12, 0))
    assert (end - start).total_seconds() == 25 * 3600


def test_no_future_clamps_rather_than_rejects():
    # no_future's job is to clamp an instant later than `now` down to `now`,
    # silently -- it never raises. That's the documented contract (a receipt's
    # OCR-misread date is rewritten to `now`, not refused), so pin the clamp
    # directly rather than only exercising it through a router.
    now = datetime(2026, 7, 28, 18, 0)
    future = datetime(2026, 7, 29, 8, 0)
    assert trips.no_future(future, now) == now


def test_no_future_leaves_a_past_instant_untouched():
    now = datetime(2026, 7, 28, 18, 0)
    past = datetime(2020, 1, 1, 0, 0)
    assert trips.no_future(past, now) == past


def test_closed_trip_is_not_open_even_with_a_future_tear_off():
    # "Cerrar compra" closes a trip early, before it would have torn off on
    # its own. Closing must win over the tear-off, not the other way round.
    now = datetime(2026, 7, 28, 18, 0)
    trip = Purchase(
        list_id="list-1",
        opened_at=datetime(2026, 7, 28, 10, 0),
        tears_off_at=datetime(2026, 7, 28, 22, 0),
        closed_at=datetime(2026, 7, 28, 17, 0),
    )
    assert trips.ends_at(trip) == datetime(2026, 7, 28, 17, 0)
    assert trips.is_open(trip, now=now) is False


def test_unclosed_trip_past_its_tear_off_is_not_open():
    now = datetime(2026, 7, 29, 8, 0)
    trip = Purchase(
        list_id="list-1",
        opened_at=datetime(2026, 7, 28, 10, 0),
        tears_off_at=datetime(2026, 7, 28, 22, 0),
        closed_at=None,
    )
    assert trips.ends_at(trip) == datetime(2026, 7, 28, 22, 0)
    assert trips.is_open(trip, now=now) is False


def test_unclosed_trip_before_its_tear_off_is_open():
    now = datetime(2026, 7, 28, 18, 0)
    trip = Purchase(
        list_id="list-1",
        opened_at=datetime(2026, 7, 28, 10, 0),
        tears_off_at=datetime(2026, 7, 28, 22, 0),
        closed_at=None,
    )
    assert trips.ends_at(trip) == datetime(2026, 7, 28, 22, 0)
    assert trips.is_open(trip, now=now) is True


@pytest.fixture(name="lst")
def list_fixture(session: Session, user: User) -> List:
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    return lst


def test_two_taps_on_one_day_find_one_trip(session: Session, lst: List):
    first = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 16, 0))
    second = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 18, 0))
    assert first.id == second.id
    # The later tap must not move opened_at — only an earlier tap back-dates
    # it. Otherwise a random ordering of taps within a day could shift when
    # the trip is said to have started.
    assert second.opened_at == datetime(2026, 7, 28, 16, 0)


def test_a_tap_that_predates_the_trip_back_dates_it(session: Session, lst: List):
    # An offline 18:00 tap draining after a 19:00 one must not make a second
    # trip, and the trip must start when the shopping did.
    trip = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 19, 0))
    again = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 18, 0))
    assert again.id == trip.id
    assert again.opened_at == datetime(2026, 7, 28, 18, 0)


def test_taps_on_different_days_get_different_trips(session: Session, lst: List):
    monday = trips.trip_for(session, lst.id, datetime(2026, 7, 27, 16, 0))
    tuesday = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 16, 0))
    assert monday.id != tuesday.id


def test_two_offline_taps_from_the_same_past_day_find_one_trip(session: Session, lst: List):
    # Draining three days late must file into that day's trip, not tonight's
    # shop, and must not make one trip per tap.
    first = trips.trip_for(session, lst.id, datetime(2026, 7, 25, 11, 0))
    second = trips.trip_for(session, lst.id, datetime(2026, 7, 25, 12, 0))
    assert first.id == second.id


def test_a_closed_trip_is_never_reused(session: Session, lst: List):
    closed = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 16, 0))
    closed.closed_at = datetime(2026, 7, 28, 17, 0)
    session.add(closed)
    session.commit()

    later = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 18, 0))
    assert later.id != closed.id


def test_the_open_trip_is_todays_unreconciled_one(session: Session, lst: List):
    now = datetime(2026, 7, 28, 18, 0)
    trip = trips.trip_for(session, lst.id, now)
    assert trips.open_trip(session, lst.id, now) is trip
    # Yesterday's untouched trip has torn off, so it is not open any more.
    assert trips.open_trip(session, lst.id, datetime(2026, 7, 29, 18, 0)) is None


def test_open_trip_ignores_a_trip_closed_early_before_it_tears_off(session: Session, lst: List):
    # A trip closed by hand before its tear-off must not read as "open" just
    # because the clock hasn't caught up to tears_off_at yet.
    trip = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 16, 0))
    trip.closed_at = datetime(2026, 7, 28, 17, 0)
    session.add(trip)
    session.commit()

    assert trips.open_trip(session, lst.id, datetime(2026, 7, 28, 18, 0)) is None


def test_different_lists_never_share_a_trip(session: Session, user: User):
    same_instant = datetime(2026, 7, 28, 16, 0)
    list_a = List(name="Casa", owner_id=user.id)
    list_b = List(name="Oficina", owner_id=user.id)
    session.add(list_a)
    session.add(list_b)
    session.commit()
    session.refresh(list_a)
    session.refresh(list_b)

    trip_a = trips.trip_for(session, list_a.id, same_instant)
    trip_b = trips.trip_for(session, list_b.id, same_instant)
    assert trip_a.id != trip_b.id


def test_open_trip_never_crosses_lists(session: Session, user: User):
    # list_a has an open trip; list_b has none. Without list_id in
    # open_trip's own WHERE, list_b's lookup would find list_a's row -- the
    # unreconciled-and-not-torn-off predicate alone can't tell them apart.
    now = datetime(2026, 7, 28, 18, 0)
    list_a = List(name="Casa", owner_id=user.id)
    list_b = List(name="Oficina", owner_id=user.id)
    session.add(list_a)
    session.add(list_b)
    session.commit()
    session.refresh(list_a)
    session.refresh(list_b)

    trip_a = trips.trip_for(session, list_a.id, now)

    assert trips.open_trip(session, list_b.id, now) is None
    assert trips.open_trip(session, list_a.id, now) is trip_a


def test_a_missed_lookup_still_yields_one_trip_via_the_unique_index(
    session: Session, lst: List, monkeypatch: pytest.MonkeyPatch
):
    # Two members tapping at the same instant can both run trip_for's SELECT
    # before either has committed an INSERT, so both find no existing trip.
    # That race is what uq_purchases_open_per_list closes: the loser's INSERT
    # fails, and trip_for must catch it and hand back the winner's row rather
    # than crash. We can't get two real transactions to interleave inside one
    # synchronous test, so we simulate the *effect* of the race: the winner's
    # row already exists and is committed, but we force this call's own
    # lookup to miss it once, the way the loser's lookup would have.
    instant = datetime(2026, 7, 28, 16, 0)
    winner = trips.trip_for(session, lst.id, instant)
    session.commit()

    real_exec = session.exec
    calls = {"n": 0}

    class _EmptyResult:
        def first(self):
            return None

    def exec_missing_the_winner_once(statement):
        calls["n"] += 1
        if calls["n"] == 1:
            return _EmptyResult()
        return real_exec(statement)

    monkeypatch.setattr(session, "exec", exec_missing_the_winner_once)

    loser = trips.trip_for(session, lst.id, instant)
    assert loser.id == winner.id


def test_an_unrelated_integrity_error_surfaces_as_itself(session: Session):
    """trip_for's `except IntegrityError` exists for one specific race: the
    unique-index collision under uq_purchases_open_per_list. It must not
    swallow any *other* integrity failure that happens to occur inside the
    same savepoint -- a `list_id` FK/NOT NULL violation, say -- into a
    confusing `NoResultFound` from the re-select. `list_id=None` violates
    Purchase.list_id's NOT NULL constraint, which is a real integrity error
    that has nothing to do with the race, and the re-select for
    `list_id IS NULL` necessarily finds nothing. The caller should see the
    original IntegrityError, not a fabricated NoResultFound.
    """
    with pytest.raises(IntegrityError):
        trips.trip_for(session, None, datetime(2026, 7, 28, 16, 0))  # type: ignore[arg-type]


def test_losing_the_race_does_not_revert_the_callers_pending_item(
    session: Session, lst: List, user: User
):
    """The savepoint must not roll back work the caller did before calling in.

    trip_for's lookup SELECT autoflushes the caller's pending UPDATE into the
    outer transaction before begin_nested() opens, so the savepoint's rollback
    has nothing of theirs to discard. That ordering is load-bearing and easy to
    break by moving the SELECT or turning autoflush off.
    """
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    at = datetime(2026, 7, 28, 18, 0)
    winner = Purchase(list_id=lst.id, opened_at=at, tears_off_at=trips.tears_off_at_for(at))
    session.add(winner)
    session.commit()

    # Mimic update_item: mutate the item first, then attach.
    item.purchased_at = at
    item.purchased_by = user.id
    session.add(item)

    # Force the lookup to miss the committed winner exactly once, so the
    # INSERT collides and the savepoint rolls back.
    real_exec = session.exec
    calls = {"n": 0}

    def missing_once(stmt, *a, **kw):
        calls["n"] += 1
        if calls["n"] == 1:

            class Empty:
                def first(self_inner):
                    return None

                def one(self_inner):
                    return real_exec(stmt, *a, **kw).one()

                def all(self_inner):
                    return real_exec(stmt, *a, **kw).all()

            return Empty()
        return real_exec(stmt, *a, **kw)

    session.exec = missing_once
    try:
        trips.attach(session, item, at)
    finally:
        session.exec = real_exec

    # Proves the race actually fired rather than the test being vacuous.
    assert item.purchase_id == winner.id
    assert len(session.exec(select(Purchase)).all()) == 1
    assert item.purchased_at == at


def test_attaching_files_the_item_into_its_days_trip(session: Session, lst: List, user: User):
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    trip = trips.attach(session, item, datetime(2026, 7, 28, 16, 0))
    session.commit()

    assert item.purchase_id == trip.id


def test_detaching_the_last_item_deletes_an_open_trip(session: Session, lst: List, user: User):
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()
    trip = trips.attach(session, item, datetime(2026, 7, 28, 16, 0))
    trip_id = trip.id
    session.commit()

    trips.detach(session, item)
    session.commit()

    assert item.purchase_id is None
    assert session.get(Purchase, trip_id) is None


def test_detaching_one_of_two_keeps_the_trip(session: Session, lst: List, user: User):
    a = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    b = ListItem(list_id=lst.id, name="Pan", added_by=user.id)
    session.add(a)
    session.add(b)
    session.commit()
    trip = trips.attach(session, a, datetime(2026, 7, 28, 16, 0))
    trips.attach(session, b, datetime(2026, 7, 28, 16, 5))
    trip_id = trip.id
    session.commit()

    trips.detach(session, a)
    session.commit()

    assert session.get(Purchase, trip_id) is not None


def test_emptying_a_closed_trip_keeps_it(session: Session, lst: List, user: User):
    # It holds a store and a total someone confirmed, and those outlive the lines.
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()
    trip = trips.attach(session, item, datetime(2026, 7, 28, 16, 0))
    trip.closed_at = datetime(2026, 7, 28, 17, 0)
    trip.store = "Lidl"
    trip.total = 14.60
    trip_id = trip.id
    session.commit()

    trips.detach(session, item)
    session.commit()

    assert session.get(Purchase, trip_id) is not None


def test_detaching_an_unattached_item_is_a_harmless_no_op(session: Session, lst: List, user: User):
    # Un-purchasing an item whose purchase never synced (or that was never
    # attached to begin with) must not raise — purchase_id is already the
    # NULL detach is trying to establish.
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    trips.detach(session, item)
    session.commit()

    assert item.purchase_id is None


def test_detaching_an_unattached_item_never_looks_up_a_trip(
    session: Session, lst: List, user: User
):
    # With purchase_id already NULL, there is no trip row to look up. Calling
    # session.get(Purchase, None) anyway is not just wasted work: SQLAlchemy
    # warns "fully NULL primary key identity cannot load any object" and says
    # outright that this "may raise an error in a future release" -- so
    # skipping the lookup for a NULL id is load-bearing, not cosmetic, even
    # though today it still happens to return None either way.
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    with warnings.catch_warnings():
        warnings.simplefilter("error", SAWarning)
        trips.detach(session, item)


def test_attaching_an_already_attached_item_moves_it_and_cleans_up_the_old_trip(
    session: Session, lst: List, user: User
):
    # An item can be re-tapped into a different day's trip (e.g. a correction,
    # or a backdated offline tap arriving after today's tap already attached
    # it). attach must move the item rather than refuse or double-attach, and
    # if the old trip is left with nothing in it, it must not linger as an
    # orphan open trip -- the same rule detach enforces everywhere else.
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    old_trip = trips.attach(session, item, datetime(2026, 7, 28, 16, 0))
    old_trip_id = old_trip.id
    session.commit()

    new_trip = trips.attach(session, item, datetime(2026, 7, 27, 16, 0))
    session.commit()

    assert item.purchase_id == new_trip.id
    assert new_trip.id != old_trip_id
    assert session.get(Purchase, old_trip_id) is None


def test_attaching_an_item_already_on_a_closed_trip_raises(session: Session, lst: List, user: User):
    # A closed trip's total is a fact someone read off a receipt. Moving a
    # line out from under it would leave the ticket claiming a total its
    # contents no longer add up to, with no error -- so re-tapping an item
    # that's already on a reconciled ticket must refuse, not silently move it.
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    trip = trips.attach(session, item, datetime(2026, 7, 28, 16, 0))
    trip.closed_at = datetime(2026, 7, 28, 17, 0)
    trip.store = "Lidl"
    trip.total = 14.60
    trip_id = trip.id
    session.commit()

    with pytest.raises(trips.AlreadyFiled):
        trips.attach(session, item, datetime(2026, 7, 28, 18, 0))

    assert item.purchase_id == trip_id


def test_reattaching_after_emptying_a_trip_does_not_reuse_the_deleted_one(
    session: Session, lst: List, user: User
):
    # detach's delete of the emptied open trip must be visible to the very
    # next trip_for lookup (attach's, here). `trip_for` is SELECT-first, so
    # the risk was never an INSERT colliding with an invisible pending
    # DELETE -- it's quieter than that: if the SELECT doesn't see the
    # pending delete, it finds and returns the *old, about-to-be-deleted*
    # trip as though it were fresh, `item.purchase_id` ends up pointing at
    # it, and that row then disappears out from under the item at the next
    # flush.
    #
    # Deliberately no commit between detach and the re-attach: the hazard is
    # the *uncommitted* DELETE still pending in the unit of work when
    # trip_for's SELECT runs -- the path a router handling
    # un-purchase-then-repurchase in one request, or a queue drain replaying
    # several ops in one session, will actually take. A commit in between
    # would make the DELETE durable and the reuse impossible to observe.
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    old_trip = trips.attach(session, item, datetime(2026, 7, 28, 16, 0))
    old_trip_id = old_trip.id
    session.commit()

    trips.detach(session, item)
    new_trip = trips.attach(session, item, datetime(2026, 7, 28, 18, 0))
    session.commit()

    # The assertion that actually matters: a fresh trip was made, not the
    # stale one handed back. Both of the assertions below hold even when the
    # stale trip is reused -- purchase_id still equals whatever trip_for
    # returned, and the old row is still deleted, just later -- so neither
    # one is sufficient by itself.
    assert new_trip.id != old_trip_id
    assert item.purchase_id == new_trip.id
    assert session.get(Purchase, old_trip_id) is None


def _cart(
    session: Session, lst: List, user: User, names: list[str], at: datetime
) -> list[ListItem]:
    made = []
    for offset, name in enumerate(names):
        item = ListItem(
            list_id=lst.id,
            name=name,
            added_by=user.id,
            purchased_at=at + timedelta(minutes=offset),
        )
        session.add(item)
        session.commit()
        trips.attach(session, item, item.purchased_at)
        made.append(item)
    session.commit()
    return made


def test_closing_the_whole_cart_closes_the_trip_in_place(session: Session, lst: List, user: User):
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche", "Pan"], at)
    before = items[0].purchase_id

    closed = trips.close(session, lst.id, None, "Lidl", 14.60, datetime(2026, 7, 28, 20, 0))
    session.commit()

    assert closed.id == before
    assert closed.closed_at == datetime(2026, 7, 28, 20, 0)
    assert closed.store == "Lidl"
    assert closed.total == 14.60


def test_closing_a_subset_splits_the_cart(session: Session, lst: List, user: User):
    # The evening this entity exists for: two people, two shops, one open trip
    # until somebody says what the shop was.
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche", "Pan", "Aceite", "Arroz"], at)
    original = items[0].purchase_id

    lidl = trips.close(
        session, lst.id, [items[0].id, items[1].id], "Lidl", 14.60, datetime(2026, 7, 28, 20, 0)
    )
    session.commit()

    assert lidl.id != original
    assert lidl.store == "Lidl"
    assert items[0].purchase_id == lidl.id
    assert items[1].purchase_id == lidl.id
    # The rest are still in the cart, still open.
    assert items[2].purchase_id == original
    assert items[3].purchase_id == original
    assert trips.open_trip(session, lst.id, datetime(2026, 7, 28, 20, 1)).id == original


def test_a_split_trip_starts_when_its_own_shopping_did(session: Session, lst: List, user: User):
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche", "Pan", "Aceite"], at)

    lidl = trips.close(
        session, lst.id, [items[1].id, items[2].id], "Lidl", 9.0, datetime(2026, 7, 28, 20, 0)
    )
    session.commit()

    assert lidl.opened_at == items[1].purchased_at


def test_splitting_off_the_earliest_item_recomputes_the_remainders_opened_at(
    session: Session, lst: List, user: User
):
    """The remainder of a split -- what stays behind, still open -- needs its
    own opened_at recomputed at split time, not just the next time it's
    closed. Splitting off the item that happened to be earliest must not
    leave the remainder claiming a start time that now belongs to the split
    ticket.
    """
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche", "Pan", "Aceite"], at)
    remainder_id = items[0].purchase_id

    trips.close(session, lst.id, [items[0].id], "Lidl", 5.0, datetime(2026, 7, 28, 20, 0))
    session.commit()

    remainder = session.get(Purchase, remainder_id)
    assert remainder.opened_at == items[1].purchased_at


def test_closing_then_tapping_opens_a_new_trip(session: Session, lst: List, user: User):
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche"], at)
    closed = trips.close(session, lst.id, None, "Lidl", 5.0, datetime(2026, 7, 28, 20, 0))
    session.commit()

    later = trips.trip_for(session, lst.id, datetime(2026, 7, 28, 20, 30))
    assert later.id != closed.id
    assert items[0].purchase_id == closed.id


def test_closing_with_nothing_in_the_cart_is_refused(session: Session, lst: List):
    with pytest.raises(trips.NothingToClose):
        trips.close(session, lst.id, None, "Lidl", 5.0, datetime(2026, 7, 28, 20, 0))


def test_closing_with_an_item_from_another_trip_is_refused(session: Session, lst: List, user: User):
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche"], at)
    stranger = ListItem(list_id=lst.id, name="Ajeno", added_by=user.id)
    session.add(stranger)
    session.commit()

    with pytest.raises(trips.NotInTheCart):
        trips.close(
            session, lst.id, [items[0].id, stranger.id], "Lidl", 5.0, datetime(2026, 7, 28, 20, 0)
        )


def test_the_full_two_shop_evening_end_to_end(session: Session, lst: List, user: User):
    # Both halves of the evening this entity exists for: Lidl reconciled first,
    # then the remainder of the cart reconciled as Mercadona. Two closed
    # trips, right stores, right items, nothing left open.
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche", "Pan", "Aceite", "Arroz"], at)

    lidl = trips.close(
        session, lst.id, [items[0].id, items[1].id], "Lidl", 14.60, datetime(2026, 7, 28, 20, 0)
    )
    session.commit()

    mercadona = trips.close(session, lst.id, None, "Mercadona", 8.30, datetime(2026, 7, 28, 20, 5))
    session.commit()

    assert lidl.id != mercadona.id
    assert lidl.store == "Lidl"
    assert mercadona.store == "Mercadona"
    assert lidl.closed_at == datetime(2026, 7, 28, 20, 0)
    assert mercadona.closed_at == datetime(2026, 7, 28, 20, 5)
    assert items[0].purchase_id == lidl.id
    assert items[1].purchase_id == lidl.id
    assert items[2].purchase_id == mercadona.id
    assert items[3].purchase_id == mercadona.id
    assert trips.open_trip(session, lst.id, datetime(2026, 7, 28, 20, 10)) is None
    # Mercadona's opened_at must come from its own remaining items, not from
    # item 0's tap time -- item 0 is on the Lidl ticket now.
    assert mercadona.opened_at == items[2].purchased_at


def test_closing_with_an_unknown_item_id_is_refused(session: Session, lst: List, user: User):
    # An id that doesn't exist in the cart at all -- not even on another trip
    # -- must be refused just as loudly as one that belongs elsewhere.
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche"], at)

    with pytest.raises(trips.NotInTheCart):
        trips.close(
            session,
            lst.id,
            [items[0].id, "does-not-exist"],
            "Lidl",
            5.0,
            datetime(2026, 7, 28, 20, 0),
        )


def test_split_trip_coexists_with_the_still_open_one(session: Session, lst: List, user: User):
    # The split shares tears_off_at with the still-open trip; only closed_at
    # being set keeps both rows outside uq_purchases_open_per_list at once.
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche", "Pan"], at)
    original_id = items[0].purchase_id

    lidl = trips.close(session, lst.id, [items[0].id], "Lidl", 5.0, datetime(2026, 7, 28, 20, 0))
    session.commit()

    original = session.get(Purchase, original_id)
    assert original is not None
    assert original.closed_at is None
    assert lidl.closed_at is not None
    assert original.tears_off_at == lidl.tears_off_at


def test_closing_an_open_but_empty_trip_is_refused(session: Session, lst: List):
    # Distinct from "no open trip at all": trip_for can create an open trip
    # before anything is ever attached to it, so the "if not cart" branch --
    # as opposed to the "trip is None" branch above it -- needs its own path
    # to actually execute.
    trips.trip_for(session, lst.id, datetime(2026, 7, 28, 18, 0))
    session.commit()

    with pytest.raises(trips.NothingToClose):
        trips.close(session, lst.id, None, "Lidl", 5.0, datetime(2026, 7, 28, 20, 0))


def test_closing_an_empty_selection_closes_nothing(session: Session, lst: List, user: User):
    # item_ids=[] means "the user selected nothing" and item_ids=None means
    # "close everything" -- opposite things. A UI that lets someone deselect
    # every item must not fall through to closing the whole cart.
    at = datetime(2026, 7, 28, 18, 0)
    _cart(session, lst, user, ["Leche"], at)

    with pytest.raises(trips.NothingToClose):
        trips.close(session, lst.id, [], "Lidl", 5.0, datetime(2026, 7, 28, 20, 0))


def test_closing_an_explicit_full_selection_takes_the_in_place_path(
    session: Session, lst: List, user: User
):
    # Every whole-cart test above passes item_ids=None. An explicit id list
    # that happens to name the whole cart must reach the same in-place path,
    # not just the None shortcut.
    at = datetime(2026, 7, 28, 18, 0)
    items = _cart(session, lst, user, ["Leche", "Pan"], at)
    before = items[0].purchase_id

    closed = trips.close(
        session, lst.id, [items[0].id, items[1].id], "Lidl", 14.60, datetime(2026, 7, 28, 20, 0)
    )
    session.commit()

    assert closed.id == before
    assert closed.closed_at == datetime(2026, 7, 28, 20, 0)
    assert closed.store == "Lidl"


def test_closing_a_named_trip_files_one_that_already_tore_off(
    session: Session, lst: List, user: User
):
    # Yesterday's cart, torn off at Madrid midnight with nobody reconciling
    # it, written down the next morning.
    yesterday = datetime(2026, 7, 29, 18, 0)
    items = _cart(session, lst, user, ["Leche"], yesterday)
    trip_id = items[0].purchase_id

    closed = trips.close(
        session,
        lst.id,
        [items[0].id],
        "Lidl",
        None,
        now=datetime(2026, 7, 30, 10, 0),
        purchase_id=trip_id,
    )
    session.commit()

    assert closed.id == trip_id
    assert closed.store == "Lidl"
    # Closed after its own tear-off, which is the whole point: no new trip is
    # invented for this morning, the old one is finally said out loud.
    assert closed.closed_at == datetime(2026, 7, 30, 10, 0)
    assert closed.closed_at > closed.tears_off_at
    assert len(session.exec(select(Purchase)).all()) == 1


def test_closing_a_trip_that_is_already_filed_is_refused(session: Session, lst: List, user: User):
    when = datetime(2026, 7, 29, 18, 0)
    # The filed trip keeps its line. With an empty cart, the emptiness alone
    # would raise NothingToClose and the refusal below would prove nothing.
    items = _cart(session, lst, user, ["Leche"], when)
    trip = session.get(Purchase, items[0].purchase_id)
    trip.closed_at = datetime(2026, 7, 29, 21, 0)
    trip.store = "Lidl"
    session.add(trip)
    session.commit()

    with pytest.raises(trips.NothingToClose):
        trips.close(
            session,
            lst.id,
            None,
            "Mercadona",
            None,
            now=datetime(2026, 7, 30, 10, 0),
            purchase_id=trip.id,
        )


def test_closing_a_trip_belonging_to_another_list_is_refused(
    session: Session, lst: List, user: User
):
    # The id is the only thing a caller supplies, and membership was checked
    # against the list in the path, not against this trip. Without the
    # list_id check, guessing an id would file another household's ticket.
    other = List(name="Otra", owner_id=user.id)
    session.add(other)
    session.commit()
    session.refresh(other)
    theirs = _cart(session, other, user, ["Leche"], datetime(2026, 7, 29, 18, 0))

    with pytest.raises(trips.NothingToClose):
        trips.close(
            session,
            lst.id,
            None,
            "Lidl",
            None,
            now=datetime(2026, 7, 30, 10, 0),
            purchase_id=theirs[0].purchase_id,
        )
