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


def test_get_items(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Eggs"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Butter"})
    response = client.get(f"/lists/{lst['id']}/items")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_items_sorted_by_name(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Zucchini"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Apple"})
    response = client.get(f"/lists/{lst['id']}/items?sort=name")
    names = [i["name"] for i in response.json()]
    assert names == sorted(names)


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
    session.expire_all()  # force re-read from DB
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
