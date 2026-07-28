from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

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
