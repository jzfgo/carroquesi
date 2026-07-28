from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.db.models import List, ListItem, Purchase, User


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
