from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import List


def _create_list(client):
    return client.post("/lists", json={"name": "Casa"}).json()


def _tap(client, list_id: str, name: str) -> dict:
    item = client.post(f"/lists/{list_id}/items", json={"name": name}).json()
    return client.patch(f"/lists/{list_id}/items/{item['id']}", json={"purchased": True}).json()


def test_closing_the_whole_cart_returns_a_closed_trip(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")
    _tap(client, lst["id"], "Pan")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "total": 14.60},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["store"] == "Lidl"
    assert body["total"] == 14.60
    assert body["closed_at"] is not None


def test_closing_a_subset_leaves_the_rest_in_a_different_open_trip(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    assert milk["purchase_id"] == bread["purchase_id"]

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"item_ids": [milk["id"]], "store": "Lidl", "total": 5.0},
    )
    assert response.status_code == 200
    closed = response.json()
    assert closed["id"] != milk["purchase_id"]

    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Leche"]["purchase_id"] == closed["id"]
    assert fetched["Pan"]["purchase_id"] == milk["purchase_id"]
    assert fetched["Pan"]["purchase_ends_at"] is not None


def test_closing_an_empty_cart_returns_409(client: TestClient):
    lst = _create_list(client)

    response = client.post(f"/lists/{lst['id']}/purchases/close", json={})

    assert response.status_code == 409


def test_naming_an_item_not_in_the_cart_returns_400(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"item_ids": [milk["id"], "does-not-exist"], "store": "Lidl"},
    )

    assert response.status_code == 400


def test_a_non_member_cannot_close(client: TestClient, other_client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = other_client.post(f"/lists/{lst['id']}/purchases/close", json={})

    assert response.status_code == 403


def test_the_full_two_shop_evening_through_http(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    oil = _tap(client, lst["id"], "Aceite")
    rice = _tap(client, lst["id"], "Arroz")
    assert milk["purchase_id"] == bread["purchase_id"] == oil["purchase_id"] == rice["purchase_id"]

    lidl = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"item_ids": [milk["id"], bread["id"]], "store": "Lidl", "total": 14.60},
    ).json()
    mercadona = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Mercadona", "total": 8.30},
    ).json()

    assert lidl["id"] != mercadona["id"]
    assert lidl["store"] == "Lidl"
    assert mercadona["store"] == "Mercadona"

    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Leche"]["purchase_id"] == lidl["id"]
    assert fetched["Pan"]["purchase_id"] == lidl["id"]
    assert fetched["Aceite"]["purchase_id"] == mercadona["id"]
    assert fetched["Arroz"]["purchase_id"] == mercadona["id"]


def test_closing_bumps_the_lists_updated_at(client: TestClient, session: Session):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    row = session.get(List, lst["id"])
    row.updated_at = datetime(2026, 1, 1)
    session.add(row)
    session.commit()

    response = client.post(f"/lists/{lst['id']}/purchases/close", json={"store": "Lidl"})
    assert response.status_code == 200

    session.expire_all()
    assert session.get(List, lst["id"]).updated_at > datetime(2026, 1, 1)


def test_closing_makes_purchase_ends_at_the_close_time_not_the_tear_off(client: TestClient):
    """Pins the Task 7 _annotate_trips mutation: a trip closed early by this
    endpoint must report its items' purchase_ends_at as closed_at, not the
    tears_off_at that governed it while it was still open."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    closed = client.post(f"/lists/{lst['id']}/purchases/close", json={"store": "Lidl"}).json()

    fetched = client.get(f"/lists/{lst['id']}/items").json()[0]
    assert fetched["id"] == milk["id"]
    assert fetched["purchase_ends_at"] == closed["closed_at"]
    assert fetched["purchase_ends_at"] != closed["tears_off_at"]
