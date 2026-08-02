from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import List, ListItem, Purchase, User
from app.services import trips

MADRID = ZoneInfo("Europe/Madrid")


@pytest.fixture(name="lst")
def list_fixture(session: Session, user: User) -> List:
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    return lst


def test_tear_off_is_the_next_local_midnight_in_naive_utc():
    # Summer: Madrid is UTC+2, so local midnight on the 29th is 22:00Z on the 28th.
    assert trips.tears_off_at_for(datetime(2026, 7, 28, 16, 0), MADRID) == datetime(
        2026, 7, 28, 22, 0
    )


def test_tear_off_follows_the_callers_zone():
    instant = datetime(2026, 7, 28, 16, 0)
    assert trips.tears_off_at_for(instant, UTC) == datetime(2026, 7, 29, 0, 0)
    assert trips.tears_off_at_for(instant, ZoneInfo("Etc/GMT+12")) == datetime(2026, 7, 29, 12, 0)


def test_closed_trip_is_not_open_even_with_a_future_tear_off():
    # Closing by hand must win over the tear-off, not the other way round.
    now = datetime(2026, 7, 28, 18, 0)
    trip = Purchase(
        list_id="list-1",
        opened_at=datetime(2026, 7, 28, 10, 0),
        tears_off_at=datetime(2026, 7, 28, 22, 0),
        closed_at=datetime(2026, 7, 28, 17, 0),
    )
    assert trips.ends_at(trip) == datetime(2026, 7, 28, 17, 0)
    assert trips.is_open(trip, now) is False


def test_unclosed_trip_past_its_tear_off_is_not_open():
    trip = Purchase(
        list_id="list-1",
        opened_at=datetime(2026, 7, 28, 10, 0),
        tears_off_at=datetime(2026, 7, 28, 22, 0),
    )
    assert trips.ends_at(trip) == datetime(2026, 7, 28, 22, 0)
    assert trips.is_open(trip, datetime(2026, 7, 29, 8, 0)) is False
    assert trips.is_open(trip, datetime(2026, 7, 28, 18, 0)) is True


def test_open_trip_for_creates_when_there_is_none(session: Session, lst: List):
    now = datetime(2026, 7, 28, 16, 0)
    trip = trips.open_trip_for(session, lst.id, now, MADRID)
    assert trip.list_id == lst.id
    assert trip.opened_at == now
    assert trip.tears_off_at == datetime(2026, 7, 28, 22, 0)
    assert trip.closed_at is None


def test_two_taps_find_one_trip(session: Session, lst: List):
    first = trips.open_trip_for(session, lst.id, datetime(2026, 7, 28, 16, 0), MADRID)
    second = trips.open_trip_for(session, lst.id, datetime(2026, 7, 28, 18, 0), MADRID)
    assert first.id == second.id
    # The later tap must not move opened_at: the trip started when it started.
    assert second.opened_at == datetime(2026, 7, 28, 16, 0)
    assert len(session.exec(select(Purchase)).all()) == 1


def test_a_closed_trip_is_never_reused(session: Session, lst: List):
    closed = trips.open_trip_for(session, lst.id, datetime(2026, 7, 28, 16, 0), MADRID)
    closed.closed_at = datetime(2026, 7, 28, 17, 0)
    session.add(closed)
    session.commit()

    later = trips.open_trip_for(session, lst.id, datetime(2026, 7, 28, 18, 0), MADRID)
    assert later.id != closed.id


def test_a_torn_off_trip_is_never_reused(session: Session, lst: List):
    yesterday = trips.open_trip_for(session, lst.id, datetime(2026, 7, 27, 16, 0), MADRID)
    session.commit()

    today = trips.open_trip_for(session, lst.id, datetime(2026, 7, 28, 16, 0), MADRID)
    assert today.id != yesterday.id


def test_different_lists_never_share_a_trip(session: Session, user: User):
    now = datetime(2026, 7, 28, 16, 0)
    list_a = List(name="Casa", owner_id=user.id)
    list_b = List(name="Oficina", owner_id=user.id)
    session.add(list_a)
    session.add(list_b)
    session.commit()
    session.refresh(list_a)
    session.refresh(list_b)

    assert (
        trips.open_trip_for(session, list_a.id, now, MADRID).id
        != trips.open_trip_for(session, list_b.id, now, MADRID).id
    )


def test_the_earliest_open_boundary_wins(session: Session, lst: List):
    """A stale future boundary must not shadow the trip that tears off first.

    Two open trips can coexist when a fast clock or a timezone change stamped
    one with a boundary further out. The selection must be deterministic and
    must pick the earlier boundary, whatever order the rows were written in.
    """
    now = datetime(2026, 7, 28, 16, 0)
    stale = Purchase(
        list_id=lst.id,
        opened_at=now - timedelta(hours=2),
        tears_off_at=datetime(2026, 7, 29, 22, 0),
    )
    session.add(stale)
    session.commit()

    near = Purchase(
        list_id=lst.id,
        opened_at=now - timedelta(hours=1),
        tears_off_at=datetime(2026, 7, 28, 22, 0),
    )
    session.add(near)
    session.commit()

    assert trips.open_trip_for(session, lst.id, now, MADRID).id == near.id


def _missing_once(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the session's first exec() come up empty, like a lost race's lookup."""
    real_exec = session.exec
    calls = {"n": 0}

    class _Empty:
        def first(self):
            return None

    def exec_missing_once(statement, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Empty()
        return real_exec(statement, *args, **kwargs)

    monkeypatch.setattr(session, "exec", exec_missing_once)


def test_the_race_loser_receives_the_winners_row(
    session: Session, lst: List, monkeypatch: pytest.MonkeyPatch
):
    """Two members tapping at once can both miss the SELECT and both INSERT.

    uq_purchases_open_per_list fails the loser's INSERT; open_trip_for must
    catch it and hand back the winner's row rather than fail the tap. Two real
    interleaved transactions can't be staged in one synchronous test, so this
    simulates the effect: the winner's row is committed, and the loser's own
    lookup is forced to miss it exactly once.
    """
    now = datetime(2026, 7, 28, 16, 0)
    winner = trips.open_trip_for(session, lst.id, now, MADRID)
    session.commit()

    _missing_once(session, monkeypatch)

    loser = trips.open_trip_for(session, lst.id, now, MADRID)
    assert loser.id == winner.id
    assert len(session.exec(select(Purchase)).all()) == 1


def test_an_unrelated_integrity_error_surfaces_as_itself(session: Session):
    """The except IntegrityError exists for one race only. Any other constraint
    failure inside the savepoint — here a NOT NULL violation on list_id — must
    re-raise as itself when the re-select finds nothing, not vanish into a
    confusing empty result."""
    with pytest.raises(IntegrityError):
        trips.open_trip_for(
            session,
            None,  # type: ignore[arg-type]
            datetime(2026, 7, 28, 16, 0),
            MADRID,
        )


def test_losing_the_race_does_not_revert_the_callers_pending_item(
    session: Session, lst: List, user: User, monkeypatch: pytest.MonkeyPatch
):
    """The savepoint must not roll back work the caller did before calling in.

    open_trip_for's lookup SELECT autoflushes the caller's pending UPDATE into
    the outer transaction before begin_nested() opens, so the savepoint's
    rollback has nothing of the caller's to discard. That ordering is
    load-bearing and easy to break by moving the SELECT or turning autoflush
    off.
    """
    item = ListItem(list_id=lst.id, name="Leche", added_by=user.id)
    session.add(item)
    session.commit()

    now = datetime(2026, 7, 28, 18, 0)
    winner = Purchase(
        list_id=lst.id, opened_at=now, tears_off_at=trips.tears_off_at_for(now, MADRID)
    )
    session.add(winner)
    session.commit()

    # Mimic update_item: mutate the item first, then resolve the trip.
    item.purchased_at = now
    item.purchased_by = user.id
    session.add(item)

    _missing_once(session, monkeypatch)

    trip = trips.open_trip_for(session, lst.id, now, MADRID)
    item.purchase_id = trip.id
    session.add(item)
    session.commit()

    # The race actually fired: the loser ended up on the winner's row.
    assert item.purchase_id == winner.id
    assert len(session.exec(select(Purchase)).all()) == 1
    session.refresh(item)
    assert item.purchased_at == now


def _purchased_item(session: Session, lst: List, user: User, name: str, when: datetime) -> ListItem:
    """An item tapped at `when`, in whatever trip that instant resolves to."""
    trip = trips.open_trip_for(session, lst.id, when, MADRID)
    item = ListItem(
        list_id=lst.id,
        name=name,
        added_by=user.id,
        purchased_at=when,
        purchased_by=user.id,
        purchase_id=trip.id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def test_close_claiming_every_item_closes_the_trip_in_place(
    session: Session, lst: List, user: User
):
    milk = _purchased_item(session, lst, user, "Leche", datetime(2026, 7, 28, 16, 0))
    bread = _purchased_item(session, lst, user, "Pan", datetime(2026, 7, 28, 17, 0))
    now = datetime(2026, 7, 28, 18, 0)

    closed = trips.close(session, lst.id, [milk.id, bread.id], "Lidl", 14.60, now)
    session.commit()

    assert closed.id == milk.purchase_id == bread.purchase_id
    assert closed.closed_at == now
    assert closed.store == "Lidl"
    assert closed.total == 14.60
    # opened_at is the earliest claimed tap, not whenever the row was made.
    assert closed.opened_at == datetime(2026, 7, 28, 16, 0)
    assert len(session.exec(select(Purchase)).all()) == 1


def test_close_claiming_a_subset_splits_off_a_new_closed_trip(
    session: Session, lst: List, user: User
):
    milk = _purchased_item(session, lst, user, "Leche", datetime(2026, 7, 28, 16, 0))
    bread = _purchased_item(session, lst, user, "Pan", datetime(2026, 7, 28, 17, 0))
    source_id = milk.purchase_id
    now = datetime(2026, 7, 28, 18, 0)

    closed = trips.close(session, lst.id, [bread.id], "Lidl", 5.0, now)
    session.commit()
    session.refresh(milk)
    session.refresh(bread)

    assert closed.id != source_id
    assert bread.purchase_id == closed.id
    assert milk.purchase_id == source_id
    assert closed.closed_at == now
    assert closed.opened_at == datetime(2026, 7, 28, 17, 0)
    remainder = session.get(Purchase, source_id)
    assert remainder.closed_at is None
    # The split inherits the source's boundary: same day, same tear-off.
    assert closed.tears_off_at == remainder.tears_off_at


def test_a_split_recomputes_the_remainders_opened_at(session: Session, lst: List, user: User):
    """The earliest tap leaves for the new ticket; the remainder must not
    keep claiming a start time that now belongs to it."""
    milk = _purchased_item(session, lst, user, "Leche", datetime(2026, 7, 28, 16, 0))
    bread = _purchased_item(session, lst, user, "Pan", datetime(2026, 7, 28, 17, 0))
    now = datetime(2026, 7, 28, 18, 0)

    trips.close(session, lst.id, [milk.id], "Lidl", None, now)
    session.commit()

    remainder = session.get(Purchase, bread.purchase_id)
    assert remainder.opened_at == datetime(2026, 7, 28, 17, 0)


def test_close_refuses_an_unknown_item(session: Session, lst: List, user: User):
    milk = _purchased_item(session, lst, user, "Leche", datetime(2026, 7, 28, 16, 0))
    now = datetime(2026, 7, 28, 18, 0)

    with pytest.raises(trips.NotInTheCart):
        trips.close(session, lst.id, [milk.id, "no-such-item"], "Lidl", None, now)

    session.rollback()
    assert session.get(Purchase, milk.purchase_id).closed_at is None


def test_close_refuses_an_item_already_on_another_ticket(session: Session, lst: List, user: User):
    milk = _purchased_item(session, lst, user, "Leche", datetime(2026, 7, 28, 16, 0))
    bread = _purchased_item(session, lst, user, "Pan", datetime(2026, 7, 28, 17, 0))
    now = datetime(2026, 7, 28, 18, 0)
    trips.close(session, lst.id, [milk.id], "Lidl", None, now)
    session.commit()

    with pytest.raises(trips.NotInTheCart):
        trips.close(session, lst.id, [milk.id, bread.id], "Mercadona", None, now)


def test_close_with_no_open_trip_raises(session: Session, lst: List):
    with pytest.raises(trips.NothingToClose):
        trips.close(session, lst.id, ["anything"], "Lidl", None, datetime(2026, 7, 28, 18, 0))


def test_close_by_name_reaches_a_torn_off_trip(session: Session, lst: List, user: User):
    """A trip that tore off with nobody saying what it was, written down
    later. Invisible to the open-cart lookup; naming it is the only way in."""
    tapped = datetime(2026, 7, 25, 19, 0)
    milk = _purchased_item(session, lst, user, "Leche", tapped)
    now = datetime(2026, 7, 28, 9, 0)

    closed = trips.close(
        session, lst.id, [milk.id], "Mercadona", 8.30, now, purchase_id=milk.purchase_id
    )
    session.commit()

    assert closed.id == milk.purchase_id
    assert closed.closed_at == now
    assert closed.store == "Mercadona"
    assert closed.tears_off_at < now


def test_close_by_name_refuses_a_trip_on_another_list(session: Session, user: User):
    list_a = List(name="Casa", owner_id=user.id)
    list_b = List(name="Oficina", owner_id=user.id)
    session.add(list_a)
    session.add(list_b)
    session.commit()
    milk = _purchased_item(session, list_a, user, "Leche", datetime(2026, 7, 28, 16, 0))

    with pytest.raises(trips.NothingToClose):
        trips.close(
            session,
            list_b.id,
            [milk.id],
            "Lidl",
            None,
            datetime(2026, 7, 28, 18, 0),
            purchase_id=milk.purchase_id,
        )


def test_close_by_name_refuses_an_already_closed_trip(session: Session, lst: List, user: User):
    milk = _purchased_item(session, lst, user, "Leche", datetime(2026, 7, 28, 16, 0))
    now = datetime(2026, 7, 28, 18, 0)
    trips.close(session, lst.id, [milk.id], "Lidl", 14.60, now)
    session.commit()

    with pytest.raises(trips.NothingToClose):
        trips.close(
            session,
            lst.id,
            [milk.id],
            "Mercadona",
            8.30,
            now,
            purchase_id=milk.purchase_id,
        )

    session.rollback()
    trip = session.get(Purchase, milk.purchase_id)
    assert trip.store == "Lidl"
    assert trip.total == 14.60


def test_a_close_that_lost_the_race_hits_the_conditional_update(
    session: Session, lst: List, user: User, monkeypatch: pytest.MonkeyPatch
):
    """Two members close the same cart; the loser's SELECT ran before the
    winner's commit landed. Under READ COMMITTED the resolve can then hand
    back a trip that is already closed, and only the conditional UPDATE
    notices — by matching zero rows.

    Two interleaved transactions cannot be staged in one synchronous test,
    so the stale read is simulated: the winner's close is committed for
    real, and the loser's resolving SELECT is forced to return the trip as
    if it were still open.
    """
    milk = _purchased_item(session, lst, user, "Leche", datetime(2026, 7, 28, 16, 0))
    now = datetime(2026, 7, 28, 18, 0)
    trip = session.get(Purchase, milk.purchase_id)
    trips.close(session, lst.id, [milk.id], "Lidl", 14.60, now)
    session.commit()

    real_exec = session.exec

    def stale_resolve(statement, *args, **kwargs):
        if "purchases.closed_at IS NULL" in str(statement):

            class _Stale:
                def first(self):
                    return trip

            return _Stale()
        return real_exec(statement, *args, **kwargs)

    monkeypatch.setattr(session, "exec", stale_resolve)

    with pytest.raises(trips.NothingToClose):
        trips.close(session, lst.id, [milk.id], "Mercadona", 8.30, now)

    session.rollback()
    session.refresh(trip)
    # The winner's confirmed figures survived.
    assert trip.store == "Lidl"
    assert trip.total == 14.60
