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
