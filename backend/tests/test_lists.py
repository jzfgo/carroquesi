from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, ListMember, ReceiptScan


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


def test_purchased_count_reflects_membership_in_the_open_trip(client: TestClient):
    lst = client.post("/lists", json={"name": "Shopping"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    lists = client.get("/lists").json()
    target = next(row for row in lists if row["id"] == lst["id"])
    assert target["purchased_count"] == 1


def test_items_purchased_on_a_torn_off_trip_excluded_from_counts(client: TestClient):
    """Items belonging to a torn-off (no longer open) trip drop out of both counts.

    Note this hand-backdates purchased_at through the PATCH body, which drives
    `trips.attach` to file the item into *that* local day's trip -- a trip
    already torn off by the time this test runs. Directly mutating the item's
    `purchased_at` on the session (the old approach) does not move
    `purchase_id`, so it would leave the item attached to today's still-open
    trip and this assertion would not exercise anything real.
    """
    lst = client.post("/lists", json={"name": "Trip"}).json()
    list_id = lst["id"]

    item_old = client.post(f"/lists/{list_id}/items", json={"name": "Yesterday item"}).json()
    item_today = client.post(f"/lists/{list_id}/items", json={"name": "Today item"}).json()
    client.post(f"/lists/{list_id}/items", json={"name": "Not yet"})

    three_days_ago = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3)).isoformat()
    client.patch(
        f"/lists/{list_id}/items/{item_old['id']}",
        json={"purchased": True, "purchased_at": three_days_ago},
    )
    client.patch(f"/lists/{list_id}/items/{item_today['id']}", json={"purchased": True})

    lists = client.get("/lists").json()
    target = next(row for row in lists if row["id"] == list_id)

    # item_old (filed into a torn-off trip) is excluded from both counts;
    # item_today (open trip) and the unpurchased item remain in scope.
    assert target["item_count"] == 2
    assert target["purchased_count"] == 1


def test_open_trips_on_two_lists_do_not_contaminate_each_other(client: TestClient):
    """The open-trip subquery is uncorrelated -- it returns every open trip ID
    across the whole database, not just this list's. Correctness rests on
    `ListItem.purchase_id` linking each item to exactly one trip, which itself
    belongs to exactly one list. This pins that: two lists, each with its own
    open trip, must not see each other's counts.
    """
    l1 = client.post("/lists", json={"name": "Lista 1"}).json()
    l2 = client.post("/lists", json={"name": "Lista 2"}).json()
    a = client.post(f"/lists/{l1['id']}/items", json={"name": "Leche"}).json()
    b = client.post(f"/lists/{l2['id']}/items", json={"name": "Pan"}).json()
    c = client.post(f"/lists/{l2['id']}/items", json={"name": "Huevos"}).json()
    client.patch(f"/lists/{l1['id']}/items/{a['id']}", json={"purchased": True})
    client.patch(f"/lists/{l2['id']}/items/{b['id']}", json={"purchased": True})
    three_days_ago = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3)).isoformat()
    client.patch(
        f"/lists/{l2['id']}/items/{c['id']}",
        json={"purchased": True, "purchased_at": three_days_ago},
    )

    by_id = {row["id"]: row for row in client.get("/lists").json()}
    assert (by_id[l1["id"]]["item_count"], by_id[l1["id"]]["purchased_count"]) == (1, 1)
    assert (by_id[l2["id"]]["item_count"], by_id[l2["id"]]["purchased_count"]) == (1, 1)


def test_closing_a_trip_removes_its_items_from_the_progress_bar_immediately(client: TestClient):
    """Follow-up (Task 9): an item closed early into a ticket via "Cerrar
    compra" must stop counting immediately, even on the same calendar day --
    the open-trip subquery keys on `Purchase.closed_at IS NULL`, and closing
    is exactly what sets it. Pins that dropping the `closed_at.is_(None)`
    filter (leaving only the tears_off_at comparison) breaks this: without it
    a just-closed trip would still read as "this shop" until local midnight.
    """
    lst = client.post("/lists", json={"name": "Trip"}).json()
    list_id = lst["id"]

    a = client.post(f"/lists/{list_id}/items", json={"name": "Leche"}).json()
    b = client.post(f"/lists/{list_id}/items", json={"name": "Pan"}).json()
    client.patch(f"/lists/{list_id}/items/{a['id']}", json={"purchased": True})
    client.patch(f"/lists/{list_id}/items/{b['id']}", json={"purchased": True})

    client.post(f"/lists/{list_id}/purchases/close", json={"store": "Lidl", "total": 5.0})

    lists = client.get("/lists").json()
    target = next(row for row in lists if row["id"] == list_id)
    assert target["item_count"] == 0
    assert target["purchased_count"] == 0
