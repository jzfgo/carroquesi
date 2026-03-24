from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, ListMember


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


def test_rename_list_non_owner_returns_403(client: TestClient, other_client: TestClient, session: Session):
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
