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


def test_an_item_read_carries_its_trip(client):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()

    assert item["purchase_id"] is None
    assert item["purchase_ends_at"] is None

    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    fetched = client.get(f"/lists/{lst['id']}/items").json()[0]

    assert fetched["purchase_id"] is not None
    assert fetched["purchase_ends_at"] is not None


def test_the_client_tap_time_decides_the_trip(client):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    now_item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    old = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"}).json()

    three_days_ago = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3)).isoformat()
    client.patch(f"/lists/{lst['id']}/items/{now_item['id']}", json={"purchased": True})
    client.patch(
        f"/lists/{lst['id']}/items/{old['id']}",
        json={"purchased": True, "purchased_at": three_days_ago},
    )

    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Leche"]["purchase_id"] != fetched["Pan"]["purchase_id"]


def test_a_tap_time_from_the_future_is_clamped_to_now(client):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    far_future = (datetime.now(UTC).replace(tzinfo=None) + timedelta(days=400)).isoformat()

    client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"purchased": True, "purchased_at": far_future},
    )
    fetched = client.get(f"/lists/{lst['id']}/items").json()[0]

    purchased_at = datetime.fromisoformat(fetched["purchased_at"])
    assert purchased_at <= datetime.now(UTC).replace(tzinfo=None)


def test_a_tap_time_older_than_the_backdate_limit_is_clamped(client):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    ancient = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=400)).isoformat()

    client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"purchased": True, "purchased_at": ancient},
    )
    fetched = client.get(f"/lists/{lst['id']}/items").json()[0]

    purchased_at = datetime.fromisoformat(fetched["purchased_at"])
    assert purchased_at > datetime.now(UTC).replace(tzinfo=None) - timedelta(days=31)


def test_unpurchasing_within_the_open_trip_is_allowed(client):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    resp = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})

    assert resp.status_code == 200
    assert resp.json()["purchase_id"] is None


def test_unpurchasing_a_torn_off_item_is_refused(client):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    three_days_ago = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3)).isoformat()
    client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"purchased": True, "purchased_at": three_days_ago},
    )

    resp = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})

    assert resp.status_code == 409


def test_two_items_purchased_together_share_one_trip_end(client):
    """Pins that _annotate_trips batches by trip id rather than computing a
    per-item value that could drift between two items on the same trip."""
    lst = client.post("/lists", json={"name": "Casa"}).json()
    milk = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    bread = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"}).json()

    client.patch(f"/lists/{lst['id']}/items/{milk['id']}", json={"purchased": True})
    client.patch(f"/lists/{lst['id']}/items/{bread['id']}", json={"purchased": True})

    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Leche"]["purchase_id"] == fetched["Pan"]["purchase_id"]
    assert fetched["Leche"]["purchase_ends_at"] == fetched["Pan"]["purchase_ends_at"]
    assert fetched["Leche"]["purchase_ends_at"] is not None


def test_get_items_annotates_purchased_and_unpurchased_items_correctly(client):
    """A mixed list should not require one trip lookup per item -- pins that
    _annotate_trips collects distinct purchase ids into a single IN query
    (rather than looking each item up individually) by asserting the
    unpurchased item gets no trip end while the purchased one does, in the
    same response."""
    lst = client.post("/lists", json={"name": "Casa"}).json()
    bought = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"}).json()
    client.patch(f"/lists/{lst['id']}/items/{bought['id']}", json={"purchased": True})

    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}

    assert fetched["Leche"]["purchase_ends_at"] is not None
    assert fetched["Pan"]["purchase_ends_at"] is None
    assert fetched["Pan"]["purchase_id"] is None


def test_purchase_filed_distinguishes_open_torn_off_and_closed_trips(client, session: Session):
    """purchase_filed is `trip.closed_at is not None`, and the three-way
    distinction is the whole point: a torn-off-but-unfiled trip and a closed
    one both read as 'bought' via the client's itemState() (both compare
    purchase_ends_at against now), yet delete_item's 409 keys on closed_at
    and behaves oppositely for the two. The client cannot mirror that 409
    without this field.
    """
    from app.db.models import ListItem, Purchase

    lst = client.post("/lists", json={"name": "Casa"}).json()

    open_item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    client.patch(f"/lists/{lst['id']}/items/{open_item['id']}", json={"purchased": True})

    torn_off_item = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"}).json()
    three_days_ago = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3)).isoformat()
    client.patch(
        f"/lists/{lst['id']}/items/{torn_off_item['id']}",
        json={"purchased": True, "purchased_at": three_days_ago},
    )

    filed_item = client.post(f"/lists/{lst['id']}/items", json={"name": "Huevos"}).json()
    two_days_ago = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2)).isoformat()
    client.patch(
        f"/lists/{lst['id']}/items/{filed_item['id']}",
        json={"purchased": True, "purchased_at": two_days_ago},
    )
    db_item = session.get(ListItem, filed_item["id"])
    trip = session.get(Purchase, db_item.purchase_id)
    trip.closed_at = datetime.now(UTC).replace(tzinfo=None)
    trip.store = "Lidl"
    trip.total = 5.0
    session.add(trip)
    session.commit()

    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}

    assert fetched["Leche"]["purchase_filed"] is False
    assert fetched["Pan"]["purchase_filed"] is False
    assert fetched["Huevos"]["purchase_filed"] is True


def test_add_item_response_defaults_purchase_filed_to_false(client):
    """add_item returns the freshly-created item without calling
    _annotate_trips (there's no trip yet), so ItemRead's default must cover
    it or the response fails validation."""
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    assert item["purchase_filed"] is False


def test_deleting_the_last_item_of_an_open_trip_does_not_orphan_it(client, session: Session):
    """delete_item must detach before deleting, the way un-purchasing does.

    Otherwise the trip trip_for/attach created survives with nothing in it:
    open_trip() still returns it, so a later "Cerrar compra" call answers 409
    "nothing in the cart to close" on a cart the user just emptied, and a
    later tap silently reattaches to the ghost instead of opening a fresh trip.
    """
    from app.db.models import Purchase

    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    fetched = client.get(f"/lists/{lst['id']}/items").json()[0]
    trip_id = fetched["purchase_id"]
    assert trip_id is not None

    response = client.delete(f"/lists/{lst['id']}/items/{item['id']}")
    assert response.status_code == 204
    assert session.get(Purchase, trip_id) is None


def test_deleting_an_item_from_a_filed_trip_is_refused(client, session: Session):
    """A closed trip's total is a fact someone read off a receipt. Deleting a
    line out from under it would leave the ticket claiming a total its
    contents no longer add up to, the same reason update_item refuses to
    un-purchase an item from a trip that has ended.
    """
    from app.db.models import ListItem, Purchase

    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(ListItem, item["id"])
    trip = session.get(Purchase, db_item.purchase_id)
    trip.closed_at = datetime.now(UTC).replace(tzinfo=None)
    trip.store = "Lidl"
    trip.total = 5.0
    session.add(trip)
    session.commit()

    response = client.delete(f"/lists/{lst['id']}/items/{item['id']}")
    assert response.status_code == 409
    assert session.get(ListItem, item["id"]) is not None


def test_purchasing_an_item_already_filed_returns_409_not_500(client, session: Session):
    """Defensive: trips.attach raises AlreadyFiled only when purchase_id points
    at a closed trip while purchased_at is None -- an invariant violation that
    should never happen through the API, but if it ever did, the router must
    not let it escape as an uncaught 500.
    """
    from app.db.models import ListItem, Purchase

    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Leche"}).json()

    trip = Purchase(
        list_id=lst["id"],
        opened_at=datetime(2026, 1, 1, 10, 0),
        tears_off_at=datetime(2026, 1, 1, 22, 0),
        closed_at=datetime(2026, 1, 1, 20, 0),
    )
    session.add(trip)
    session.commit()
    session.refresh(trip)

    db_item = session.get(ListItem, item["id"])
    db_item.purchase_id = trip.id
    session.add(db_item)
    session.commit()

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    assert response.status_code == 409
