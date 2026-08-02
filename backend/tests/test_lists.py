from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, ListItem, ListMember, Purchase, ReceiptScan, User


def _reshape_trip(session: Session, item_id: str, *, tear_off=None, closed_at=None) -> Purchase:
    """Move the boundary of the trip an item was purchased on."""
    db_item = session.get(ListItem, item_id)
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    if tear_off is not None:
        trip.tears_off_at = tear_off
    if closed_at is not None:
        trip.closed_at = closed_at
    session.add(trip)
    session.commit()
    return trip


def test_create_list(client: TestClient, session: Session):
    response = client.post("/lists", json={"name": "Mercadona"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Mercadona"
    # Owner is automatically a member
    members = session.exec(select(ListMember).where(ListMember.list_id == data["id"])).all()
    assert len(members) == 1


def test_get_lists_returns_owned_and_member_lists(client: TestClient, session: Session, user):
    response = client.post("/lists", json={"name": "My List"})
    assert response.status_code == 201
    response = client.get("/lists")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_list_detail(client: TestClient):
    created = client.post("/lists", json={"name": "Detail List"}).json()
    response = client.get(f"/lists/{created['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Detail List"


def test_get_list_not_member_returns_403(client: TestClient, other_client: TestClient):
    created = client.post("/lists", json={"name": "Private"}).json()
    response = other_client.get(f"/lists/{created['id']}")
    assert response.status_code == 403


def test_rename_list(client: TestClient):
    created = client.post("/lists", json={"name": "Old Name"}).json()
    response = client.patch(f"/lists/{created['id']}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_rename_list_non_owner_returns_403(
    client: TestClient, other_client: TestClient, session: Session
):
    created = client.post("/lists", json={"name": "Owned"}).json()
    response = other_client.patch(f"/lists/{created['id']}", json={"name": "Hacked"})
    assert response.status_code == 403


def test_rename_list_bumps_updated_at(client: TestClient):
    created = client.post("/lists", json={"name": "Original"}).json()
    original_updated_at = created["updated_at"]
    response = client.patch(f"/lists/{created['id']}", json={"name": "Renamed"})
    assert response.status_code == 200
    assert response.json()["updated_at"] >= original_updated_at


def test_delete_list_non_owner_returns_403(client: TestClient, other_client: TestClient):
    created = client.post("/lists", json={"name": "Owned"}).json()
    response = other_client.delete(f"/lists/{created['id']}")
    assert response.status_code == 403


def test_delete_list(client: TestClient, session: Session):
    created = client.post("/lists", json={"name": "To Delete"}).json()
    response = client.delete(f"/lists/{created['id']}")
    assert response.status_code == 204
    assert session.get(List, created["id"]) is None


def test_delete_list_with_receipt_scans(client: TestClient, session: Session, user):
    created = client.post("/lists", json={"name": "Con Ticket"}).json()
    scan = ReceiptScan(list_id=created["id"], scanned_by=user.id, items_updated=0)
    session.add(scan)
    session.commit()

    response = client.delete(f"/lists/{created['id']}")
    assert response.status_code == 204
    assert session.get(List, created["id"]) is None


def test_get_lists_includes_zero_counts_when_no_items(client: TestClient):
    client.post("/lists", json={"name": "Empty List"})
    response = client.get("/lists")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["item_count"] == 0
    assert data[0]["purchased_count"] == 0
    assert data[0]["cart_count"] == 0


def test_get_lists_returns_correct_counts(client: TestClient):
    list_resp = client.post("/lists", json={"name": "Mi Lista"})
    list_id = list_resp.json()["id"]

    # Add 3 items; mark 1 as purchased
    item1 = client.post(f"/lists/{list_id}/items", json={"name": "Leche"}).json()
    client.post(f"/lists/{list_id}/items", json={"name": "Pan"})
    client.post(f"/lists/{list_id}/items", json={"name": "Huevos"})
    client.patch(f"/lists/{list_id}/items/{item1['id']}", json={"purchased": True})

    response = client.get("/lists")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["item_count"] == 3
    assert data[0]["purchased_count"] == 1


def test_get_lists_counts_are_isolated_per_list(client: TestClient):
    # List 1: 3 items, 2 purchased
    list1_resp = client.post("/lists", json={"name": "Lista 1"})
    list1_id = list1_resp.json()["id"]
    item1a = client.post(f"/lists/{list1_id}/items", json={"name": "Leche"}).json()
    item1b = client.post(f"/lists/{list1_id}/items", json={"name": "Pan"}).json()
    client.post(f"/lists/{list1_id}/items", json={"name": "Huevos"})
    client.patch(f"/lists/{list1_id}/items/{item1a['id']}", json={"purchased": True})
    client.patch(f"/lists/{list1_id}/items/{item1b['id']}", json={"purchased": True})

    # List 2: 1 item, 0 purchased
    list2_resp = client.post("/lists", json={"name": "Lista 2"})
    list2_id = list2_resp.json()["id"]
    client.post(f"/lists/{list2_id}/items", json={"name": "Detergente"})

    response = client.get("/lists")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    by_id = {lst["id"]: lst for lst in data}
    assert by_id[list1_id]["item_count"] == 3
    assert by_id[list1_id]["purchased_count"] == 2
    assert by_id[list2_id]["item_count"] == 1
    assert by_id[list2_id]["purchased_count"] == 0


def test_create_list_with_emoji(client: TestClient):
    response = client.post("/lists", json={"name": "Frutas", "emoji": "🍎"})
    assert response.status_code == 201
    assert response.json()["emoji"] == "🍎"


def test_create_list_without_emoji_returns_null(client: TestClient):
    response = client.post("/lists", json={"name": "Sin emoji"})
    assert response.status_code == 201
    assert response.json()["emoji"] is None


def test_update_emoji(client: TestClient):
    created = client.post("/lists", json={"name": "Mi lista"}).json()
    response = client.patch(f"/lists/{created['id']}", json={"emoji": "🛒"})
    assert response.status_code == 200
    assert response.json()["emoji"] == "🛒"


def test_update_emoji_to_null(client: TestClient):
    created = client.post("/lists", json={"name": "Mi lista", "emoji": "🛒"}).json()
    response = client.patch(f"/lists/{created['id']}", json={"emoji": None})
    assert response.status_code == 200
    assert response.json()["emoji"] is None


def test_update_emoji_non_owner_returns_403(client: TestClient, other_client: TestClient):
    created = client.post("/lists", json={"name": "Mía"}).json()
    response = other_client.patch(f"/lists/{created['id']}", json={"emoji": "🍎"})
    assert response.status_code == 403


def test_purchased_count_reflects_purchased_at(client: TestClient):
    lst = client.post("/lists", json={"name": "Shopping"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    lists = client.get("/lists").json()
    target = next(row for row in lists if row["id"] == lst["id"])
    assert target["purchased_count"] == 1


def test_items_on_torn_off_trips_excluded_from_counts(client: TestClient, session: Session):
    """Items whose trip tore off must not appear in item_count or purchased_count."""
    lst = client.post("/lists", json={"name": "Trip"}).json()
    list_id = lst["id"]

    item_old = client.post(f"/lists/{list_id}/items", json={"name": "Yesterday item"}).json()
    item_today = client.post(f"/lists/{list_id}/items", json={"name": "Today item"}).json()
    client.post(f"/lists/{list_id}/items", json={"name": "Not yet"})

    # Purchase the first item and tear its trip off before purchasing the
    # second, so the second purchase opens a fresh trip of its own.
    client.patch(f"/lists/{list_id}/items/{item_old['id']}", json={"purchased": True})
    now = datetime.now(UTC).replace(tzinfo=None)
    _reshape_trip(session, item_old["id"], tear_off=now - timedelta(hours=1))
    client.patch(f"/lists/{list_id}/items/{item_today['id']}", json={"purchased": True})

    lists = client.get("/lists").json()
    target = next(row for row in lists if row["id"] == list_id)

    # item_old (torn-off trip) is excluded; item_today + the unpurchased
    # item remain in scope — the LEFT JOIN keeps items without a trip.
    assert target["item_count"] == 2
    assert target["purchased_count"] == 1


def test_get_lists_includes_member_names(client: TestClient, session: Session, user, other_user):
    lst = client.post("/lists", json={"name": "Compartida"}).json()
    session.add(ListMember(list_id=lst["id"], user_id=other_user.id))
    session.commit()

    data = client.get("/lists").json()
    members = data[0]["members"]
    assert {(m["user_id"], m["display_name"]) for m in members} == {
        (user.id, "Alice"),
        (other_user.id, "Bob"),
    }


def test_get_lists_member_name_falls_back_to_email_local_part(client: TestClient, session: Session):
    lst = client.post("/lists", json={"name": "Con invitada"}).json()
    anon = User(firebase_uid="uid-carla", display_name=None, email="carla@example.com")
    session.add(anon)
    session.commit()
    session.refresh(anon)
    session.add(ListMember(list_id=lst["id"], user_id=anon.id))
    session.commit()

    data = client.get("/lists").json()
    names = {m["display_name"] for m in data[0]["members"]}
    assert "carla" in names


def test_get_lists_payload_contains_no_emails(client: TestClient, session: Session, other_user):
    lst = client.post("/lists", json={"name": "Privada"}).json()
    session.add(ListMember(list_id=lst["id"], user_id=other_user.id))
    session.commit()

    response = client.get("/lists")
    assert response.status_code == 200
    assert "@example.com" not in response.text
    for member in response.json()[0]["members"]:
        assert set(member) == {"user_id", "display_name"}


def test_cart_count_counts_open_trip_purchases_and_excludes_torn_off_trips(
    client: TestClient, session: Session
):
    lst = client.post("/lists", json={"name": "Carro"}).json()
    list_id = lst["id"]

    item_today = client.post(f"/lists/{list_id}/items", json={"name": "Hoy"}).json()
    item_old = client.post(f"/lists/{list_id}/items", json={"name": "Ayer"}).json()
    client.post(f"/lists/{list_id}/items", json={"name": "Pendiente"})

    # Same trick as the counts test above: tear off the first purchase's
    # trip so the second purchase lands on a fresh open trip.
    client.patch(f"/lists/{list_id}/items/{item_old['id']}", json={"purchased": True})
    now = datetime.now(UTC).replace(tzinfo=None)
    _reshape_trip(session, item_old["id"], tear_off=now - timedelta(hours=1))
    client.patch(f"/lists/{list_id}/items/{item_today['id']}", json={"purchased": True})

    data = client.get("/lists").json()
    target = next(row for row in data if row["id"] == list_id)
    assert target["cart_count"] == 1


def test_counts_exclude_a_trip_closed_before_its_tear_off(client: TestClient, session: Session):
    """Closing early wins over the tear-off: a reconciled trip leaves the cart
    even while its midnight boundary is still ahead."""
    lst = client.post("/lists", json={"name": "Carro"}).json()
    list_id = lst["id"]

    item = client.post(f"/lists/{list_id}/items", json={"name": "Cerrado"}).json()
    client.post(f"/lists/{list_id}/items", json={"name": "Pendiente"})
    client.patch(f"/lists/{list_id}/items/{item['id']}", json={"purchased": True})
    now = datetime.now(UTC).replace(tzinfo=None)
    trip = _reshape_trip(session, item["id"], closed_at=now - timedelta(minutes=5))
    assert trip.tears_off_at > now

    data = client.get("/lists").json()
    target = next(row for row in data if row["id"] == list_id)
    assert target["cart_count"] == 0
    assert target["purchased_count"] == 0
    # The unpurchased item still counts: the join must not drop it.
    assert target["item_count"] == 1


def test_single_list_endpoints_keep_member_and_cart_defaults(client: TestClient):
    created = client.post("/lists", json={"name": "Individual"}).json()
    assert created["members"] == []
    assert created["cart_count"] == 0

    detail = client.get(f"/lists/{created['id']}").json()
    assert detail["members"] == []
    assert detail["cart_count"] == 0
