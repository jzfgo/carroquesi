from fastapi.testclient import TestClient
from sqlmodel import Session


def test_suggestions_returns_matching_names(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(f"/lists/{lst['id']}/items", json={"name": "Milk", "brand": "Pascual"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Mineral Water"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"})

    response = client.get("/suggestions?q=mi")
    assert response.status_code == 200
    names = [s["name"] for s in response.json()]
    assert "Milk" in names
    assert "Mineral Water" in names
    assert "Bread" not in names


def test_suggestions_includes_hints(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "brand": "Pascual", "stores": ["Mercadona"]},
    )

    response = client.get("/suggestions?q=Milk")
    assert response.status_code == 200
    suggestion = next(s for s in response.json() if s["name"] == "Milk")
    assert suggestion["brand"] == "Pascual"
    assert suggestion["stores"] == ["Mercadona"]


def test_suggestions_returns_multiple_stores(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona", "Carrefour"]},
    )

    response = client.get("/suggestions?q=Milk")
    assert response.status_code == 200
    suggestion = next(s for s in response.json() if s["name"] == "Milk")
    assert suggestion["stores"] == ["Mercadona", "Carrefour"]


def test_suggestions_limited_to_current_membership(
    client: TestClient, other_client: TestClient, session: Session
):
    other_lst = other_client.post("/lists", json={"name": "Other"}).json()
    other_client.post(f"/lists/{other_lst['id']}/items", json={"name": "SecretItem"})

    response = client.get("/suggestions?q=Secret")
    names = [s["name"] for s in response.json()]
    assert "SecretItem" not in names


def test_polling_updated_at(client: TestClient):
    lst = client.post("/lists", json={"name": "Polling Test"}).json()
    response = client.get(f"/lists/{lst['id']}/updated-at")
    assert response.status_code == 200
    assert "updated_at" in response.json()


def test_polling_updated_at_changes_after_item_add(client: TestClient):
    import time

    lst = client.post("/lists", json={"name": "Polling Test"}).json()
    before = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]
    time.sleep(0.01)
    client.post(f"/lists/{lst['id']}/items", json={"name": "New Item"})
    after = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]
    assert after > before
