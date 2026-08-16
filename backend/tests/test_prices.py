from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.db.models import ListItem as DBListItem


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


def test_get_price_history_this_list_by_ean(client: TestClient):
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


def test_get_price_history_excludes_items_without_price(client: TestClient):
    ean = "8410188099999"
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Leche", ean=ean)
    _make_item(client, lst["id"], name="Leche entera", ean=ean)  # no price logged

    _set_price(client, lst["id"], item1["id"], 0.89)

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    assert len(resp.json()["entries"]) == 1


def test_get_price_history_my_lists_by_ean(client: TestClient):
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
    client: TestClient, other_client: TestClient
):
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


def test_get_price_history_all_includes_other_users(client: TestClient, other_client: TestClient):
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


def _tear_off_trip(session, item_id, *, tear_off=None, closed_at=None):
    """Reshape the boundary of the trip the item was purchased on."""
    from app.db.models import Purchase

    db_item = session.get(DBListItem, item_id)
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    if tear_off is not None:
        trip.tears_off_at = tear_off
    if closed_at is not None:
        trip.closed_at = closed_at
    session.add(trip)
    session.commit()
    return trip


def test_delete_price_422_after_the_trip_tore_off(client: TestClient, session):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    now = datetime.now(UTC).replace(tzinfo=None)
    _tear_off_trip(session, item["id"], tear_off=now - timedelta(hours=1))

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 422


def test_delete_price_422_when_the_trip_closed_before_a_future_tear_off(
    client: TestClient, session
):
    """Closing early wins over the tear-off: settled spend stops taking edits
    even while the trip's midnight boundary is still ahead."""
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    now = datetime.now(UTC).replace(tzinfo=None)
    trip = _tear_off_trip(session, item["id"], closed_at=now - timedelta(hours=1))
    assert trip.tears_off_at > now

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 422


def test_delete_price_422_when_the_purchased_items_trip_is_missing(client: TestClient, session):
    """A purchased item that cannot prove its trip is open is refused —
    refusing is recoverable, erasing settled spend is not."""
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(DBListItem, item["id"])
    session.refresh(db_item)
    db_item.purchase_id = None
    session.add(db_item)
    session.commit()

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 422


def test_delete_price_204_while_the_trip_is_open(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 204


def _set_trip_store(session, item_id, store):
    """Set the store on the trip the item was purchased on."""
    from app.db.models import Purchase

    db_item = session.get(DBListItem, item_id)
    session.refresh(db_item)
    trip = session.get(Purchase, db_item.purchase_id)
    trip.store = store
    session.add(trip)
    session.commit()
    return trip


def _insert_row(session, list_id, added_by, **fields):
    """Insert a ListItem directly, bypassing the create-endpoint dedup that
    refuses a second unpurchased row sharing a name or EAN."""
    row = DBListItem(list_id=list_id, added_by=added_by, **fields)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _insert_trip(session, list_id, store):
    from app.db.models import Purchase

    trip = Purchase(
        list_id=list_id,
        tears_off_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        store=store,
    )
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return trip


def test_sin_precio_purchase_line_appears_in_history(client: TestClient, session):
    """A closed-trip line with no price (bought, price unconfirmed) surfaces as
    a gap: is_sin_precio=True, amount None, store taken from its trip."""
    lst = _make_list(client)
    item = _make_item(client, lst["id"], name="Leche", ean="8410188100001")
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    _set_trip_store(session, item["id"], "Mercadona")

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["is_sin_precio"] is True
    assert entries[0]["amount"] is None
    assert entries[0]["store"] == "Mercadona"


def test_pending_never_bought_row_is_excluded(client: TestClient, session, user):
    """A row with neither a price nor a purchase (pending, never bought) stays
    out of history."""
    ean = "8410188100002"
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Leche", ean=ean)
    # A pending sibling: same EAN, no price, no trip. Inserted directly because
    # the create endpoint would reject a second unpurchased same-EAN row.
    _insert_row(session, lst["id"], user.id, name="Leche entera", ean=ean)
    _set_price(client, lst["id"], item1["id"], 0.89)

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["is_sin_precio"] is False


def test_manually_logged_price_is_not_sin_precio(client: TestClient):
    """A price logged by hand (no trip) keeps appearing, flagged is_sin_precio
    False."""
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 2.50, store="Lidl")

    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["is_sin_precio"] is False
    assert entries[0]["amount"] == 2.50
    assert entries[0]["store"] == "Lidl"


def test_sin_precio_store_comes_from_the_trip(client: TestClient, session, user):
    """Per-store attribution: a sin-precio line has no price_store of its own,
    so its store is read off the trip it was bought on."""
    ean = "8410188100003"
    lst = _make_list(client)
    priced = _make_item(client, lst["id"], name="Aceite", ean=ean)
    _set_price(client, lst["id"], priced["id"], 4.20, store="Carrefour")
    # A sin-precio sibling bought on an Alcampo trip: no price, no price_store,
    # only a purchase_id. Inserted directly to sidestep the create-endpoint
    # dedup on the shared EAN.
    trip = _insert_trip(session, lst["id"], "Alcampo")
    _insert_row(
        session,
        lst["id"],
        user.id,
        name="Aceite oliva",
        ean=ean,
        purchase_id=trip.id,
        purchased_at=datetime.now(UTC).replace(tzinfo=None),
    )

    resp = client.get(f"/lists/{lst['id']}/items/{priced['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    by_store = {e["store"]: e for e in entries}
    assert by_store["Carrefour"]["is_sin_precio"] is False
    assert by_store["Alcampo"]["is_sin_precio"] is True
    assert by_store["Alcampo"]["amount"] is None


def test_sin_precio_row_excluded_from_other_users_lists_by_scope(
    client: TestClient, other_client: TestClient, session
):
    """Scope still isolates: a sin-precio line on Bob's list is invisible under
    my_lists but visible under all."""
    ean = "8410188100004"
    lst_alice = _make_list(client)
    item_alice = _make_item(client, lst_alice["id"], name="Leche", ean=ean)
    _set_price(client, lst_alice["id"], item_alice["id"], 0.89, store="Mercadona")

    lst_bob = _make_list(other_client)
    item_bob = _make_item(other_client, lst_bob["id"], name="Leche", ean=ean)
    other_client.patch(f"/lists/{lst_bob['id']}/items/{item_bob['id']}", json={"purchased": True})
    _set_trip_store(session, item_bob["id"], "Lidl")

    mine = client.get(
        f"/lists/{lst_alice['id']}/items/{item_alice['id']}/prices?scope=my_lists"
    ).json()["entries"]
    assert {e["store"] for e in mine} == {"Mercadona"}

    all_scope = client.get(
        f"/lists/{lst_alice['id']}/items/{item_alice['id']}/prices?scope=all"
    ).json()["entries"]
    stores = {e["store"] for e in all_scope}
    assert "Mercadona" in stores
    assert "Lidl" in stores


def test_price_history_orders_dated_rows_before_dateless(client: TestClient):
    """Dated purchase rows sort oldest-first; dateless manual logs trail."""
    ean = "8410188100005"
    lst = _make_list(client)
    dated = _make_item(client, lst["id"], name="Pan", ean=ean)
    client.patch(f"/lists/{lst['id']}/items/{dated['id']}", json={"purchased": True})
    _set_price(client, lst["id"], dated["id"], 1.10, store="Mercadona")
    manual = _make_item(client, lst["id"], name="Pan molde", ean=ean)
    _set_price(client, lst["id"], manual["id"], 1.30, store="Lidl")

    entries = client.get(f"/lists/{lst['id']}/items/{dated['id']}/prices?scope=this_list").json()[
        "entries"
    ]
    assert entries[0]["purchased_at"] is not None
    assert entries[-1]["purchased_at"] is None


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
