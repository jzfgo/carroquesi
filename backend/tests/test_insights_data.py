from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlmodel import Session

from app.db.models import List, ListItem, ListStore, Purchase, User
from app.services.insights.data import (
    count_tripless,
    load_window,
    local_month,
    month_bounds,
    shift_month,
)
from app.services.store_key import store_key

MADRID = ZoneInfo("Europe/Madrid")


def _list(session: Session, owner: User) -> List:
    lst = List(name="Casa", owner_id=owner.id)
    session.add(lst)
    session.commit()
    return lst


def _trip(session: Session, lst: List, opened_at: datetime, **fields) -> Purchase:
    trip = Purchase(
        list_id=lst.id, opened_at=opened_at, tears_off_at=opened_at + timedelta(days=1), **fields
    )
    session.add(trip)
    session.commit()
    return trip


def _line(session: Session, lst: List, trip: Purchase | None, by: User, **fields) -> ListItem:
    item = ListItem(
        list_id=lst.id,
        added_by=by.id,
        purchase_id=trip.id if trip else None,
        purchased_at=trip.opened_at if trip else datetime(2026, 10, 10, tzinfo=UTC),
        **({"name": "Leche"} | fields),
    )
    session.add(item)
    session.commit()
    return item


def test_month_bounds_are_local_midnights_in_utc():
    # October 2026 starts in summer time (UTC+2) and ends in winter time (UTC+1).
    assert month_bounds("2026-10", MADRID) == (
        datetime(2026, 9, 30, 22, tzinfo=UTC),
        datetime(2026, 10, 31, 23, tzinfo=UTC),
    )


def test_month_bounds_reject_a_bad_month():
    with pytest.raises(ValueError):
        month_bounds("2026-13", MADRID)


def test_shift_month_crosses_years():
    assert shift_month("2026-01", -1) == "2025-12"
    assert shift_month("2026-10", -4) == "2026-06"
    assert shift_month("2026-12", 1) == "2027-01"


def test_local_month_reads_an_aware_instant_in_the_given_zone():
    # 23:30Z on 31 July is already 1 August in Madrid.
    instant = datetime(2026, 7, 31, 23, 30, tzinfo=UTC)
    assert local_month(instant, ZoneInfo("Europe/Madrid")) == "2026-08"
    assert local_month(instant, UTC) == "2026-07"


def test_local_month_refuses_a_naive_instant():
    with pytest.raises(ValueError):
        local_month(datetime(2026, 7, 31, 23, 30), UTC)


def test_a_late_night_trip_belongs_to_its_local_month(session: Session, user: User):
    lst = _list(session, user)
    # 22:30 UTC on Oct 31 is 23:30 in Madrid: still October.
    _trip(session, lst, datetime(2026, 10, 31, 22, 30, tzinfo=UTC))
    start, end = month_bounds("2026-10", MADRID)

    w = load_window(session, lst.id, start, end, MADRID)

    assert [t.month for t in w.trips] == ["2026-10"]


def test_a_line_takes_its_price_store_over_the_trips(session: Session, user: User):
    lst = _list(session, user)
    trip = _trip(session, lst, datetime(2026, 10, 10, 10, tzinfo=UTC), store="Mercadona")
    _line(session, lst, trip, user, price=1.0, price_store="AhorraMas")
    start, end = month_bounds("2026-10", MADRID)

    (line,) = load_window(session, lst.id, start, end, MADRID).lines

    assert line.store_key == store_key("AhorraMas")
    assert line.store_raw == "AhorraMas"


def test_a_line_without_price_store_takes_the_trips(session: Session, user: User):
    lst = _list(session, user)
    trip = _trip(session, lst, datetime(2026, 10, 10, 10, tzinfo=UTC), store="Mercadona")
    _line(session, lst, trip, user, price=1.0)
    start, end = month_bounds("2026-10", MADRID)

    (line,) = load_window(session, lst.id, start, end, MADRID).lines

    assert line.store_key == store_key("Mercadona")


def test_line_money_and_unit_price(session: Session, user: User):
    lst = _list(session, user)
    trip = _trip(session, lst, datetime(2026, 10, 10, 10, tzinfo=UTC))
    _line(session, lst, trip, user, name="Pan")
    _line(
        session,
        lst,
        trip,
        user,
        name="Solomillo",
        brand="Hacendado",
        quantity="1 kg",
        purchased_quantity="0.636 kg",
        price=12.50,
        price_per="KILOGRAM",
    )
    start, end = month_bounds("2026-10", MADRID)

    lines = {line.name: line for line in load_window(session, lst.id, start, end, MADRID).lines}

    assert lines["Pan"].amount is None
    assert lines["Pan"].unit_price is None
    tray = lines["Solomillo"]
    assert tray.amount == pytest.approx(7.95)
    assert (tray.unit_price, tray.basis) == (12.50, "kg")
    assert tray.product == ("solomillo", "hacendado")


def test_trips_outside_the_window_are_not_loaded(session: Session, user: User):
    lst = _list(session, user)
    _trip(session, lst, datetime(2026, 9, 15, 10, tzinfo=UTC))
    inside = _trip(session, lst, datetime(2026, 10, 15, 10, tzinfo=UTC))
    start, end = month_bounds("2026-10", MADRID)

    w = load_window(session, lst.id, start, end, MADRID)

    assert [t.id for t in w.trips] == [inside.id]
    assert w.first_trip_month == "2026-09"


def test_names_cover_a_requester_who_left_and_the_store_registry(
    session: Session, user: User, other_user: User
):
    # other_user was never added as a member: they stand for someone who left.
    lst = _list(session, user)
    session.add(
        ListStore(list_id=lst.id, store_key=store_key("Mercadona"), display_name="Mercadona")
    )
    trip = _trip(session, lst, datetime(2026, 10, 10, 10, tzinfo=UTC), store="MERCADONA")
    _line(session, lst, trip, other_user, price=1.0)
    start, end = month_bounds("2026-10", MADRID)

    w = load_window(session, lst.id, start, end, MADRID)

    assert w.user_names[other_user.id] == "Bob"
    assert w.store_names[store_key("Mercadona")] == "Mercadona"


def test_purchased_lines_without_a_trip_are_only_counted(session: Session, user: User):
    lst = _list(session, user)
    _line(session, lst, None, user, price=1.0)
    start, end = month_bounds("2026-10", MADRID)

    w = load_window(session, lst.id, start, end, MADRID)

    assert w.lines == []
    assert count_tripless(session, lst.id, start, end) == 1


def test_a_per_kg_line_without_a_weight_adds_no_money(session: Session, user: User):
    lst = _list(session, user)
    trip = _trip(session, lst, datetime(2026, 10, 10, 10, tzinfo=UTC))
    _line(session, lst, trip, user, quantity="1 ud", price=9.90, price_per="KILOGRAM")
    start, end = month_bounds("2026-10", MADRID)

    (line,) = load_window(session, lst.id, start, end, MADRID).lines

    assert line.amount is None
    assert line.unit_price is None


def test_a_line_takes_its_trips_day_not_its_tap(session: Session, user: User):
    # A back-dated close moves the trip's day and leaves the tap time alone.
    # The trip's day is the real one, so every insight must file the line there.
    lst = _list(session, user)
    trip = _trip(session, lst, datetime(2026, 10, 30, 10, tzinfo=UTC))
    item = _line(session, lst, trip, user, price=1.0)
    item.purchased_at = datetime(2026, 11, 2, 10, tzinfo=UTC)
    session.add(item)
    session.commit()
    start, _ = month_bounds("2026-10", MADRID)
    _, end = month_bounds("2026-11", MADRID)

    (line,) = load_window(session, lst.id, start, end, MADRID).lines

    assert line.month == "2026-10"
    assert line.day == trip.opened_at
