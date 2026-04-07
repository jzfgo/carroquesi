import pytest
from fastapi.testclient import TestClient


def _make_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def _make_item(client, list_id, name="Leche", ean=None):
    body = {"name": name}
    if ean:
        body["ean"] = ean
    return client.post(f"/lists/{list_id}/items", json=body).json()


def test_log_price(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"], ean="8410188082498")

    resp = client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 0.89, "price_per": None, "store": "Mercadona"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount"] == 0.89
    assert data["store"] == "Mercadona"
    assert data["ean"] == "8410188082498"


def test_log_price_denormalizes_ean(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"], ean="1234567890123")
    resp = client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 2.50},
    )
    assert resp.status_code == 200
    assert resp.json()["ean"] == "1234567890123"


def test_log_price_item_without_ean(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])  # no ean
    resp = client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.00},
    )
    assert resp.status_code == 200
    assert resp.json()["ean"] is None


def test_log_price_non_member_forbidden(client: TestClient, other_client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    resp = other_client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.0},
    )
    assert resp.status_code == 403


def test_get_price_history_this_list(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"], ean="8410188011111")
    client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.20, "price_per": "KILOGRAM", "store": "Lidl"},
    )

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    data = resp.json()
    assert "groups" in data
    assert len(data["groups"]) == 1
    assert data["groups"][0]["store"] == "Lidl"
    assert data["groups"][0]["records"][0]["amount"] == 1.20


def test_get_price_history_my_lists_uses_ean(client: TestClient):
    ean = "8410188022222"
    lst1 = _make_list(client)
    item1 = _make_item(client, lst1["id"], name="Aceite", ean=ean)
    client.post(f"/lists/{lst1['id']}/items/{item1['id']}/prices", json={"amount": 4.50, "store": "Mercadona"})

    lst2 = client.post("/lists", json={"name": "Lista 2"}).json()
    item2 = _make_item(client, lst2["id"], name="Aceite oliva", ean=ean)
    client.post(f"/lists/{lst2['id']}/items/{item2['id']}/prices", json={"amount": 5.00, "store": "Carrefour"})

    resp = client.get(f"/lists/{lst1['id']}/items/{item1['id']}/prices?scope=my_lists")
    assert resp.status_code == 200
    stores = {g["store"] for g in resp.json()["groups"]}
    assert "Mercadona" in stores
    assert "Carrefour" in stores


def test_get_price_history_invalid_scope(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=invalid")
    assert resp.status_code == 422
