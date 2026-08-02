from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session


def _create_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def test_add_item(client: TestClient):
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"})
    assert response.status_code == 201
    assert response.json()["name"] == "Milk"
    assert response.json()["purchased"] is False
    assert response.json()["stores"] == []


def test_get_items(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Eggs"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Butter"})
    response = client.get(f"/lists/{lst['id']}/items")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_update_item_marks_purchased(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    assert response.status_code == 200
    assert response.json()["purchased"] is True


def test_delete_item(client: TestClient, session: Session):
    from app.db.models import ListItem

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "To Delete"}).json()
    response = client.delete(f"/lists/{lst['id']}/items/{item['id']}")
    assert response.status_code == 204
    assert session.get(ListItem, item["id"]) is None


def test_non_member_cannot_add_item(other_client: TestClient, client: TestClient):
    lst = client.post("/lists", json={"name": "Private"}).json()
    response = other_client.post(f"/lists/{lst['id']}/items", json={"name": "Hack"})
    assert response.status_code == 403


def test_add_item_bumps_updated_at(client: TestClient, session: Session):
    from app.db.models import List

    lst = _create_list(client)
    old_updated_at = session.get(List, lst["id"]).updated_at
    client.post(f"/lists/{lst['id']}/items", json={"name": "Tomato"})
    session.expire_all()
    new_updated_at = session.get(List, lst["id"]).updated_at
    assert new_updated_at >= old_updated_at


def test_add_item_with_multiple_stores(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona", "Carrefour"]},
    )
    assert response.status_code == 201
    assert response.json()["stores"] == ["Mercadona", "Carrefour"]


def test_update_item_stores(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    response = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"stores": ["Lidl"]},
    )
    assert response.status_code == 200
    assert response.json()["stores"] == ["Lidl"]


def test_update_item_clears_stores(client: TestClient):
    lst = _create_list(client)
    item = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona"]},
    ).json()
    response = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"stores": []},
    )
    assert response.status_code == 200
    assert response.json()["stores"] == []


def test_update_item_sets_purchased_at(client: TestClient, session: Session):
    from app.db.models import ListItem

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    assert item["purchased"] is False

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    assert response.status_code == 200
    assert response.json()["purchased"] is True

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    assert db_item.purchased_at is not None


def test_update_item_clears_purchased_at(client: TestClient, session: Session):
    from app.db.models import ListItem

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 200
    assert response.json()["purchased"] is False

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    assert db_item.purchased_at is None


def test_repurchase_does_not_overwrite_purchased_at(client: TestClient, session: Session):
    from app.db.models import ListItem

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    original_purchased_at = db_item.purchased_at

    # Patch purchased=True again — should NOT update purchased_at
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    session.refresh(db_item)
    assert db_item.purchased_at == original_purchased_at


def _purchase_and_age(
    client, session, lst, item, *, tear_off=None, closed_at=None, updated_ago=None
):
    """Purchase the item, then age its record and reshape its trip's boundary.

    Returns the trip so a test can assert against it. `updated_ago` pushes the
    item's last write into the past so the grace window stays out of the way.
    """
    from app.db.models import ListItem, Purchase

    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    if tear_off is not None:
        trip.tears_off_at = tear_off
    if closed_at is not None:
        trip.closed_at = closed_at
    session.add(trip)
    if updated_ago is not None:
        db_item.updated_at = now - updated_ago
        session.add(db_item)
    session.commit()
    return trip


def test_unpurchase_allowed_while_the_trip_is_open(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 200
    assert response.json()["purchased"] is False


def test_cannot_unpurchase_after_the_trip_tore_off(client: TestClient, session: Session):
    from app.routers.items import UNPURCHASE_GRACE

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    now = datetime.now(UTC).replace(tzinfo=None)
    _purchase_and_age(
        client,
        session,
        lst,
        item,
        tear_off=now - timedelta(hours=1),
        updated_ago=UNPURCHASE_GRACE + timedelta(minutes=1),
    )

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 409


def test_unpurchase_blocked_when_the_trip_closed_before_a_future_tear_off(
    client: TestClient, session: Session
):
    """Closing early wins over the tear-off: a reconciled trip stops taking
    corrections even while its midnight boundary is still ahead."""
    from app.routers.items import UNPURCHASE_GRACE

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    now = datetime.now(UTC).replace(tzinfo=None)
    trip = _purchase_and_age(
        client,
        session,
        lst,
        item,
        closed_at=now - timedelta(hours=1),
        updated_ago=UNPURCHASE_GRACE + timedelta(minutes=1),
    )
    assert trip.tears_off_at > now

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 409


def test_unpurchase_backdated_item_within_write_grace(client: TestClient, session: Session):
    """A receipt scanned days after shopping backdates purchased_at onto a trip
    that has already torn off, but the record itself was just written — undoing
    a wrong link must still work."""
    from app.db.models import ListItem

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    now = datetime.now(UTC).replace(tzinfo=None)
    _purchase_and_age(client, session, lst, item, tear_off=now - timedelta(days=2))

    db_item = session.get(ListItem, item["id"])
    db_item.purchased_at = now - timedelta(days=2)
    session.add(db_item)
    session.commit()

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 200
    assert response.json()["purchased"] is False

    session.refresh(db_item)
    assert db_item.purchased_at is None


def test_cannot_unpurchase_when_write_grace_expired(client: TestClient, session: Session):
    from app.routers.items import UNPURCHASE_GRACE

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    now = datetime.now(UTC).replace(tzinfo=None)
    _purchase_and_age(
        client,
        session,
        lst,
        item,
        tear_off=now - timedelta(days=2),
        updated_ago=UNPURCHASE_GRACE + timedelta(minutes=1),
    )

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 409


def test_unpurchase_treats_a_dangling_trip_as_closed_but_grace_rescues(
    client: TestClient, session: Session
):
    """A purchased item whose trip row is gone cannot prove its trip is open,
    so it is refused — unless the record was written moments ago."""
    from app.db.models import ListItem
    from app.routers.items import UNPURCHASE_GRACE

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    now = datetime.now(UTC).replace(tzinfo=None)
    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    db_item.purchase_id = "no-such-trip"
    db_item.updated_at = now - UNPURCHASE_GRACE - timedelta(minutes=1)
    session.add(db_item)
    session.commit()

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 409

    # The same dangling reference written moments ago is a fresh mistake,
    # and fresh mistakes stay reversible.
    db_item.updated_at = now
    session.add(db_item)
    session.commit()

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 200
    session.refresh(db_item)
    assert db_item.purchased_at is None


def test_purchase_assigns_the_open_trip(client: TestClient, session: Session):
    from sqlmodel import select

    from app.db.models import ListItem, Purchase

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    assert response.status_code == 200

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    assert db_item.purchase_id is not None
    trip = session.get(Purchase, db_item.purchase_id)
    assert trip.list_id == lst["id"]
    assert trip.opened_at == db_item.purchased_at
    assert trip.closed_at is None
    assert trip.tears_off_at > db_item.purchased_at
    assert len(session.exec(select(Purchase)).all()) == 1


def test_two_purchases_share_one_trip(client: TestClient, session: Session):
    from sqlmodel import select

    from app.db.models import ListItem, Purchase

    lst = _create_list(client)
    first = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    second = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    client.patch(f"/lists/{lst['id']}/items/{first['id']}", json={"purchased": True})
    client.patch(f"/lists/{lst['id']}/items/{second['id']}", json={"purchased": True})

    session.expire_all()
    ids = {
        session.get(ListItem, first["id"]).purchase_id,
        session.get(ListItem, second["id"]).purchase_id,
    }
    assert None not in ids
    assert len(ids) == 1
    assert len(session.exec(select(Purchase)).all()) == 1


def test_purchase_without_timezone_header_stamps_a_utc_boundary(
    client: TestClient, session: Session
):
    """A client that declares no zone (Siri, API-key callers) is judged in UTC
    days, so its trip must tear off at the next UTC midnight."""
    from app.db.models import ListItem, Purchase
    from app.services.trips import tears_off_at_for

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    assert trip.tears_off_at == tears_off_at_for(db_item.purchased_at, UTC)


def test_purchase_stamps_the_boundary_in_the_clients_zone(client: TestClient, session: Session):
    from zoneinfo import ZoneInfo

    from app.db.models import ListItem, Purchase
    from app.services.trips import tears_off_at_for

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"purchased": True},
        headers={"X-Client-Timezone": "Etc/GMT+12"},
    )

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    assert trip.tears_off_at == tears_off_at_for(db_item.purchased_at, ZoneInfo("Etc/GMT+12"))


def test_unpurchase_clears_the_trip_link_and_deletes_the_emptied_open_trip(
    client: TestClient, session: Session
):
    from sqlmodel import select

    from app.db.models import ListItem, Purchase

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 200

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    assert db_item.purchase_id is None
    assert session.exec(select(Purchase)).all() == []


def test_unpurchase_keeps_an_open_trip_that_still_has_items(client: TestClient, session: Session):
    from app.db.models import ListItem, Purchase

    lst = _create_list(client)
    first = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    second = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    client.patch(f"/lists/{lst['id']}/items/{first['id']}", json={"purchased": True})
    client.patch(f"/lists/{lst['id']}/items/{second['id']}", json={"purchased": True})

    trip_id = session.get(ListItem, first["id"]).purchase_id
    client.patch(f"/lists/{lst['id']}/items/{first['id']}", json={"purchased": False})

    session.expire_all()
    assert session.get(Purchase, trip_id) is not None
    assert session.get(ListItem, second["id"]).purchase_id == trip_id
    assert session.get(ListItem, first["id"]).purchase_id is None


def test_unpurchase_never_deletes_a_closed_trip(client: TestClient, session: Session):
    """A closed trip is a historical record: someone wrote the shop down.
    Emptying it must not erase it."""
    from app.db.models import ListItem, Purchase

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    trip.closed_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(trip)
    session.commit()

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 200

    session.expire_all()
    assert session.get(Purchase, trip.id) is not None
    session.refresh(db_item)
    assert db_item.purchase_id is None


def test_add_item_with_ean(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Leche", "ean": "8410188082498"},
    )
    assert response.status_code == 201
    assert response.json()["ean"] == "8410188082498"


def test_add_item_without_ean(client: TestClient):
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"})
    assert response.status_code == 201
    assert response.json()["ean"] is None


def test_get_items_has_price_fields(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"})
    response = client.get(f"/lists/{lst['id']}/items")
    assert response.status_code == 200
    item = response.json()[0]
    assert "price" in item
    assert item["price"] is None
    assert "price_per" in item
    assert item["price_per"] is None
    assert "price_store" in item
    assert item["price_store"] is None


def test_add_item_with_inline_price(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={
            "name": "Leche",
            "price": 1.5,
            "price_per": None,
            "price_store": "Mercadona",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["price"] == 1.5
    assert body["price_per"] is None
    assert body["price_store"] == "Mercadona"


def test_add_item_with_inline_price_per_kg(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={
            "name": "Arroz",
            "price": 3.2,
            "price_per": "KILOGRAM",
            "price_store": None,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["price"] == 3.2
    assert body["price_per"] == "KILOGRAM"
    assert body["price_store"] is None


def test_add_item_price_per_without_price_is_rejected(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Arroz", "price_per": "KILOGRAM"},
    )
    assert response.status_code == 422


def test_add_duplicate_name_rejected(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"})
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "leche"})
    assert response.status_code == 409
    assert response.json()["detail"] == "Item already in list"


def test_add_duplicate_ean_rejected(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Yogur", "ean": "1234567890123"})
    response = client.post(
        f"/lists/{lst['id']}/items", json={"name": "Otro yogur", "ean": "1234567890123"}
    )
    assert response.status_code == 409


def test_add_same_name_as_purchased_item_allowed(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"})
    assert response.status_code == 201


def test_add_unique_item_allowed(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Tomate"})
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Lechuga"})
    assert response.status_code == 201


def test_item_read_carries_the_trips_end_instant(client: TestClient, session: Session):
    from app.db.models import ListItem, Purchase

    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    assert item["purchase_ends_at"] is None

    patched = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True}
    ).json()
    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    assert patched["purchase_ends_at"] == trip.tears_off_at.isoformat()

    listed = client.get(f"/lists/{lst['id']}/items").json()
    assert listed[0]["purchase_ends_at"] == trip.tears_off_at.isoformat()

    # Closing early moves the end instant: closed_at wins over the tear-off.
    closed = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5)
    trip.closed_at = closed
    session.add(trip)
    session.commit()

    listed = client.get(f"/lists/{lst['id']}/items").json()
    assert listed[0]["purchase_ends_at"] == closed.isoformat()
