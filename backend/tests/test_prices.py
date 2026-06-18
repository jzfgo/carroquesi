from datetime import timedelta

from fastapi.testclient import TestClient
from pytest_httpx import HTTPXMock

from app.db.models import ListItem as DBListItem

_OPEN_PRICES_URL = "https://prices.openfoodfacts.org/api/v1/prices"
_OPEN_PRICES_ES = {
    "items": [
        {"price": 1.0, "price_per": None, "location": {"osm_address_country_code": "ES"}},
        {"price": 2.0, "price_per": None, "location": {"osm_address_country_code": "ES"}},
    ]
}
_OPEN_PRICES_EMPTY = {"items": []}


def _make_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def _make_item(client, list_id, name="Leche", ean=None, brand=None):
    body = {"name": name}
    if ean:
        body["ean"] = ean
    if brand:
        body["brand"] = brand
    return client.post(f"/lists/{list_id}/items", json=body).json()


def _set_price(client, list_id, item_id, amount, store=None, price_per=None):
    return client.post(
        f"/lists/{list_id}/items/{item_id}/prices",
        json={"amount": amount, "store": store, "price_per": price_per},
    )


# --- POST (create) ---


def test_post_price_creates(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"], ean="8410188082498")

    resp = _set_price(client, lst["id"], item["id"], 0.89, store="Mercadona")
    assert resp.status_code == 201
    data = resp.json()
    assert data["amount"] == 0.89
    assert data["store"] == "Mercadona"
    assert data["price_per"] is None


def test_post_price_sets_item_fields(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.29, store="Lidl")

    resp = client.get(f"/lists/{lst['id']}/items")
    updated = next(i for i in resp.json() if i["id"] == item["id"])
    assert updated["price"] == 1.29
    assert updated["price_store"] == "Lidl"


def test_post_price_conflict_if_already_set(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00)

    resp = _set_price(client, lst["id"], item["id"], 2.00)
    assert resp.status_code == 409


def test_post_price_non_member_forbidden(client: TestClient, other_client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    resp = other_client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.0},
    )
    assert resp.status_code == 403


# --- PATCH (update) ---


def test_patch_price_updates(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00, store="Lidl")

    resp = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.50, "store": "Carrefour"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount"] == 1.50
    assert data["store"] == "Carrefour"


def test_patch_price_updates_item_fields(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00)

    client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 2.00, "store": "Mercadona"},
    )
    resp = client.get(f"/lists/{lst['id']}/items")
    updated = next(i for i in resp.json() if i["id"] == item["id"])
    assert updated["price"] == 2.00
    assert updated["price_store"] == "Mercadona"


def test_patch_price_not_found_if_no_price(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])

    resp = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.00},
    )
    assert resp.status_code == 404


def test_patch_price_non_member_forbidden(client: TestClient, other_client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00)

    resp = other_client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 2.00},
    )
    assert resp.status_code == 403


# --- GET (price history by scope) ---


def test_get_price_history_this_list_by_ean(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=_OPEN_PRICES_EMPTY)
    ean = "8410188011111"
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Aceite", ean=ean)
    client.patch(f"/lists/{lst['id']}/items/{item1['id']}", json={"purchased": True})
    item2 = _make_item(client, lst["id"], name="Aceite extra", ean=ean)

    _set_price(client, lst["id"], item1["id"], 4.20, store="Mercadona")
    _set_price(client, lst["id"], item2["id"], 4.50, store="Carrefour")

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert stores == {"Mercadona", "Carrefour"}


def test_get_price_history_this_list_by_name_brand(client: TestClient):
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Pan integral", brand="Bimbo")
    client.patch(f"/lists/{lst['id']}/items/{item1['id']}", json={"purchased": True})
    item2 = _make_item(client, lst["id"], name="Pan integral", brand="Bimbo")

    _set_price(client, lst["id"], item1["id"], 1.20, store="Lidl")
    _set_price(client, lst["id"], item2["id"], 1.35, store="Mercadona")

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert stores == {"Lidl", "Mercadona"}


def test_get_price_history_excludes_items_without_price(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=_OPEN_PRICES_EMPTY)
    ean = "8410188099999"
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Leche", ean=ean)
    _make_item(client, lst["id"], name="Leche entera", ean=ean)  # no price logged

    _set_price(client, lst["id"], item1["id"], 0.89)

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    assert len(resp.json()["entries"]) == 1


def test_get_price_history_my_lists_by_ean(client: TestClient, httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=_OPEN_PRICES_EMPTY)
    ean = "8410188022222"
    lst1 = _make_list(client)
    item1 = _make_item(client, lst1["id"], name="Aceite", ean=ean)
    _set_price(client, lst1["id"], item1["id"], 4.50, store="Mercadona")

    lst2 = client.post("/lists", json={"name": "Lista 2"}).json()
    item2 = _make_item(client, lst2["id"], name="Aceite oliva", ean=ean)
    _set_price(client, lst2["id"], item2["id"], 5.00, store="Carrefour")

    resp = client.get(f"/lists/{lst1['id']}/items/{item1['id']}/prices?scope=my_lists")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert "Mercadona" in stores
    assert "Carrefour" in stores


def test_get_price_history_my_lists_excludes_other_users(
    client: TestClient, other_client: TestClient, httpx_mock: HTTPXMock
):
    httpx_mock.add_response(json=_OPEN_PRICES_EMPTY)
    ean = "8410188077777"
    lst_alice = _make_list(client)
    item_alice = _make_item(client, lst_alice["id"], name="Leche", ean=ean)
    _set_price(client, lst_alice["id"], item_alice["id"], 0.89, store="Mercadona")

    lst_bob = _make_list(other_client)
    item_bob = _make_item(other_client, lst_bob["id"], name="Leche", ean=ean)
    other_client.post(
        f"/lists/{lst_bob['id']}/items/{item_bob['id']}/prices",
        json={"amount": 0.79, "store": "Lidl"},
    )

    resp = client.get(f"/lists/{lst_alice['id']}/items/{item_alice['id']}/prices?scope=my_lists")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert "Mercadona" in stores
    assert "Lidl" not in stores


def test_get_price_history_all_includes_other_users(
    client: TestClient, other_client: TestClient, httpx_mock: HTTPXMock
):
    httpx_mock.add_response(json=_OPEN_PRICES_EMPTY)
    ean = "8410188066666"
    lst_alice = _make_list(client)
    item_alice = _make_item(client, lst_alice["id"], name="Leche", ean=ean)
    _set_price(client, lst_alice["id"], item_alice["id"], 0.89, store="Mercadona")

    lst_bob = _make_list(other_client)
    item_bob = _make_item(other_client, lst_bob["id"], name="Leche", ean=ean)
    other_client.post(
        f"/lists/{lst_bob['id']}/items/{item_bob['id']}/prices",
        json={"amount": 0.79, "store": "Lidl"},
    )

    resp = client.get(f"/lists/{lst_alice['id']}/items/{item_alice['id']}/prices?scope=all")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert "Mercadona" in stores
    assert "Lidl" in stores


def test_get_price_history_invalid_scope(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=invalid")
    assert resp.status_code == 422


# --- purchased_at in PriceEntry ---


def test_price_history_entry_includes_purchased_at_for_purchased_item(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    # Mark as purchased so purchased_at is set
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    _set_price(client, lst["id"], item["id"], 1.99, store="Mercadona")

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["purchased_at"] is not None
    # Should be a valid ISO datetime string
    from datetime import datetime

    datetime.fromisoformat(entries[0]["purchased_at"])  # raises if malformed


def test_price_history_entry_purchased_at_is_null_for_unpurchased_item(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    # Item is not purchased — purchased_at should be None
    _set_price(client, lst["id"], item["id"], 2.50, store="Lidl")

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["purchased_at"] is None


# --- community_price in PriceHistoryResponse ---


def test_price_history_returns_community_price_when_ean_has_data(
    client: TestClient, httpx_mock: HTTPXMock
):
    httpx_mock.add_response(json=_OPEN_PRICES_ES)
    lst = _make_list(client)
    item = _make_item(client, lst["id"], ean="8410188082498")
    _set_price(client, lst["id"], item["id"], 0.89)

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    data = resp.json()
    assert data["community_price"] == 1.5
    assert data["community_price_per"] is None


def test_price_history_community_price_null_when_no_ean(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])  # no EAN
    _set_price(client, lst["id"], item["id"], 1.99)

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    data = resp.json()
    assert data["community_price"] is None
    assert data["community_price_per"] is None


def test_price_history_community_price_negatively_cached(client: TestClient, httpx_mock: HTTPXMock):
    # First call: Open Prices returns no data — negative cache entry written
    httpx_mock.add_response(json=_OPEN_PRICES_EMPTY)
    lst = _make_list(client)
    item = _make_item(client, lst["id"], ean="8410188082498")
    _set_price(client, lst["id"], item["id"], 0.89)

    resp1 = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp1.json()["community_price"] is None

    # Second call: no httpx_mock expectation added — if Open Prices were hit again it would raise
    resp2 = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp2.status_code == 200
    assert resp2.json()["community_price"] is None


# --- DELETE ---


def test_delete_price_clears_fields(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99, store="Mercadona")

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 204

    items = client.get(f"/lists/{lst['id']}/items").json()
    updated = next(i for i in items if i["id"] == item["id"])
    assert updated["price"] is None
    assert updated["price_per"] is None
    assert updated["price_store"] is None


def test_delete_price_non_member_forbidden(client: TestClient, other_client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)

    resp = other_client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 403


def test_delete_price_404_if_no_price(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 404


def test_delete_price_422_if_purchased_previous_day(client: TestClient, session):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(DBListItem, item["id"])
    db_item.purchased_at = db_item.purchased_at - timedelta(days=1)
    session.add(db_item)
    session.commit()

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 422


def test_delete_price_204_if_purchased_today(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 204


def test_price_history_entry_includes_quantity(client: TestClient):
    lst = _make_list(client)
    item = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Fresas", "quantity": "500g"},
    ).json()
    _set_price(client, lst["id"], item["id"], 1.50, store="Mercadona")

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["quantity"] == "500g"
