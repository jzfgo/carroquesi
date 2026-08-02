import json
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, ListItem, ListStore, Purchase


def _create_list(client):
    return client.post("/lists", json={"name": "Casa"}).json()


def _add(client, list_id: str, name: str, **fields) -> dict:
    return client.post(f"/lists/{list_id}/items", json={"name": name, **fields}).json()


def _tap(client, list_id: str, name: str, **fields) -> dict:
    item = _add(client, list_id, name, **fields)
    return client.patch(f"/lists/{list_id}/items/{item['id']}", json={"purchased": True}).json()


def _items_by_name(client, list_id: str) -> dict:
    return {i["name"]: i for i in client.get(f"/lists/{list_id}/items").json()}


def _close(client, list_id: str, **body):
    return client.post(f"/lists/{list_id}/purchases/close", json=body)


def _lines(*items) -> list[dict]:
    return [{"item_id": item["id"]} for item in items]


def _pid(session: Session, item: dict) -> str | None:
    """The trip an item is filed under. Read from the row: ItemRead does not
    carry purchase_id — the read surface for trips is later work."""
    row = session.get(ListItem, item["id"])
    session.refresh(row)
    return row.purchase_id


def _tear_off(session: Session, item: dict, days_ago: int) -> str:
    """Backdate an item's tap and its trip, so the trip has already torn off.

    The item PATCH cannot backdate a purchase, so the shape is built
    directly: the same rows the app would hold the morning after a shop
    nobody wrote down. Returns the trip's id.
    """
    now = datetime.now(UTC).replace(tzinfo=None)
    row = session.get(ListItem, item["id"])
    trip = session.get(Purchase, row.purchase_id)
    trip.opened_at = now - timedelta(days=days_ago)
    trip.tears_off_at = now - timedelta(days=days_ago - 1)
    session.add(trip)
    row.purchased_at = now - timedelta(days=days_ago)
    session.add(row)
    session.commit()
    return trip.id


def test_closing_the_whole_cart_closes_the_trip_in_place(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    cart_id = _pid(session, milk)
    assert cart_id == _pid(session, bread)

    response = _close(client, lst["id"], store="Lidl", total=14.60, lines=_lines(milk, bread))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == cart_id
    assert body["store"] == "Lidl"
    assert body["total"] == 14.60
    assert body["closed_at"] is not None


def test_closing_a_subset_splits_a_new_ticket_and_leaves_the_rest_open(
    client: TestClient, session: Session
):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    cart_id = _pid(session, milk)
    assert cart_id == _pid(session, bread)

    response = _close(client, lst["id"], store="Lidl", total=5.0, lines=_lines(milk))

    assert response.status_code == 200
    closed = response.json()
    assert closed["id"] != cart_id
    assert _pid(session, milk) == closed["id"]
    assert _pid(session, bread) == cart_id
    assert session.get(Purchase, cart_id).closed_at is None


def test_the_two_shop_evening_ends_with_two_tickets_and_no_open_trip(
    client: TestClient, session: Session
):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    oil = _tap(client, lst["id"], "Aceite")
    rice = _tap(client, lst["id"], "Arroz")

    lidl = _close(client, lst["id"], store="Lidl", total=14.60, lines=_lines(milk, bread)).json()
    mercadona = _close(client, lst["id"], store="Mercadona", lines=_lines(oil, rice)).json()

    assert lidl["id"] != mercadona["id"]
    assert _pid(session, milk) == _pid(session, bread) == lidl["id"]
    assert _pid(session, oil) == _pid(session, rice) == mercadona["id"]
    # No close ever leaves an empty open trip behind.
    open_trips = session.exec(
        select(Purchase).where(Purchase.list_id == lst["id"], Purchase.closed_at.is_(None))
    ).all()
    assert open_trips == []


def test_closing_a_torn_off_trip_by_name(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    trip_id = _tear_off(session, milk, days_ago=3)

    response = _close(
        client,
        lst["id"],
        purchase_id=trip_id,
        store="Mercadona",
        lines=[{"item_id": milk["id"], "price": 1.19}],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == trip_id
    assert body["store"] == "Mercadona"
    # The test only means anything if the trip really had torn off.
    tears_off_at = datetime.fromisoformat(body["tears_off_at"])
    assert tears_off_at < datetime.now(UTC).replace(tzinfo=None)


def test_closing_an_already_closed_trip_returns_409(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    trip_id = _pid(session, milk)
    first = _close(client, lst["id"], store="Lidl", total=14.60, lines=_lines(milk))
    assert first.status_code == 200

    response = _close(client, lst["id"], purchase_id=trip_id, store="Mercadona", lines=_lines(milk))

    assert response.status_code == 409


def test_closing_with_no_open_trip_returns_409(client: TestClient):
    lst = _create_list(client)
    pending = _add(client, lst["id"], "Leche")

    response = _close(client, lst["id"], store="Lidl", lines=_lines(pending))

    assert response.status_code == 409


def test_a_concurrent_close_is_refused_not_overwritten(
    client: TestClient, session: Session, monkeypatch
):
    """The second member's close resolved its trip before the first's commit
    landed. The stale read is simulated by pinning the resolving SELECT to
    the already-closed trip; the conditional UPDATE then matches zero rows,
    and the winner's confirmed figures survive.
    """
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    winner = _close(client, lst["id"], store="Lidl", total=14.60, lines=_lines(milk))
    assert winner.status_code == 200
    trip = session.get(Purchase, winner.json()["id"])

    real_exec = session.exec

    def stale_resolve(statement, *args, **kwargs):
        if "purchases.closed_at IS NULL" in str(statement):

            class _Stale:
                def first(self):
                    return trip

            return _Stale()
        return real_exec(statement, *args, **kwargs)

    monkeypatch.setattr(session, "exec", stale_resolve)

    response = _close(client, lst["id"], store="Mercadona", total=8.30, lines=_lines(milk))

    assert response.status_code == 409
    session.rollback()
    session.refresh(trip)
    assert trip.store == "Lidl"
    assert trip.total == 14.60


def test_a_close_with_no_lines_is_rejected(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    assert _close(client, lst["id"], store="Lidl").status_code == 422
    assert _close(client, lst["id"], store="Lidl", lines=[]).status_code == 422


def test_naming_an_unknown_item_returns_400_and_files_nothing(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    cart_id = _pid(session, milk)

    response = _close(
        client,
        lst["id"],
        store="Lidl",
        lines=[{"item_id": milk["id"]}, {"item_id": "does-not-exist"}],
    )

    assert response.status_code == 400
    assert _pid(session, milk) == cart_id
    assert session.get(Purchase, cart_id).closed_at is None


def test_naming_another_lists_item_returns_400_and_does_not_touch_it(
    client: TestClient, other_client: TestClient, session: Session
):
    """An item id is not proof of access to the item it names."""
    mine = _create_list(client)
    milk = _tap(client, mine["id"], "Leche")
    theirs = other_client.post("/lists", json={"name": "Vecinos"}).json()
    their_bread = _tap(other_client, theirs["id"], "Pan")
    their_cart = _pid(session, their_bread)

    response = _close(
        client,
        mine["id"],
        store="Lidl",
        lines=[{"item_id": milk["id"]}, {"item_id": their_bread["id"], "price": 9.99}],
    )

    assert response.status_code == 400
    fetched = other_client.get(f"/lists/{theirs['id']}/items").json()[0]
    assert fetched["price"] is None
    assert _pid(session, their_bread) == their_cart
    assert session.get(Purchase, their_cart).closed_at is None


def test_an_item_already_on_another_ticket_returns_400(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    _close(client, lst["id"], store="Lidl", lines=_lines(milk))

    # The milk is on Lidl's ticket now. It cannot also be on Mercadona's.
    response = _close(client, lst["id"], store="Mercadona", lines=_lines(milk, bread))

    assert response.status_code == 400


def test_a_non_member_cannot_close(client: TestClient, other_client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = other_client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"]}]},
    )

    assert response.status_code == 403


def test_a_confirmed_price_is_written_with_the_closes_store(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    line = {"item_id": milk["id"], "price": 1.19, "price_per": "KILOGRAM", "quantity": "2 kg"}
    response = _close(client, lst["id"], store="Lidl", lines=[line])

    assert response.status_code == 200
    fetched = _items_by_name(client, lst["id"])["Leche"]
    assert fetched["price"] == 1.19
    assert fetched["price_per"] == "KILOGRAM"
    assert fetched["price_store"] == "Lidl"
    assert fetched["purchased_quantity"] == "2 kg"


def test_an_unconfirmed_price_clears_the_items_old_figures(client: TestClient):
    """A dash on the sheet is an answer: bought, price unconfirmed. Whatever
    figure the item carried described some earlier shop, not this one."""
    lst = _create_list(client)
    milk = _tap(
        client,
        lst["id"],
        "Leche",
        price=2.50,
        price_per="KILOGRAM",
        price_store="Dia",
    )
    assert milk["price"] == 2.50

    response = _close(client, lst["id"], store="Lidl", lines=_lines(milk))

    assert response.status_code == 200
    fetched = _items_by_name(client, lst["id"])["Leche"]
    assert fetched["price"] is None
    assert fetched["price_per"] is None
    assert fetched["price_store"] is None
    assert fetched["purchased"] is True


def test_the_total_may_be_left_unconfirmed(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = _close(client, lst["id"], store="Lidl", lines=_lines(milk))

    assert response.status_code == 200
    assert response.json()["total"] is None


def test_new_items_are_born_purchased_on_the_ticket(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = _close(
        client,
        lst["id"],
        store="Lidl",
        lines=_lines(milk),
        new_items=[
            {"name": "Chocolate negro", "price": 3.18, "quantity": "2"},
            {"name": "Pilas"},
        ],
    )

    assert response.status_code == 200
    trip_id = response.json()["id"]
    fetched = _items_by_name(client, lst["id"])
    choc = fetched["Chocolate negro"]
    assert choc["purchased"] is True
    assert choc["price"] == 3.18
    assert choc["price_store"] == "Lidl"
    assert choc["purchased_quantity"] == "2"
    assert choc["quantity"] is None
    assert _pid(session, choc) == trip_id
    # Without a confirmed price there is nothing to file a store under.
    pilas = fetched["Pilas"]
    assert pilas["purchased"] is True
    assert pilas["price"] is None
    assert pilas["price_store"] is None
    assert _pid(session, pilas) == trip_id


def test_closing_registers_the_store_for_the_list(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    _close(client, lst["id"], store="Lidl", lines=_lines(milk))

    keys = session.exec(select(ListStore.store_key).where(ListStore.list_id == lst["id"])).all()
    assert "lidl" in keys


def test_closing_bumps_the_lists_updated_at(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    row = session.get(List, lst["id"])
    row.updated_at = datetime(2026, 1, 1)
    session.add(row)
    session.commit()

    response = _close(client, lst["id"], store="Lidl", lines=_lines(milk))

    assert response.status_code == 200
    session.expire_all()
    assert session.get(List, lst["id"]).updated_at > datetime(2026, 1, 1)


def test_closing_makes_purchase_ends_at_the_close_time_not_the_tear_off(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    closed = _close(client, lst["id"], store="Lidl", lines=_lines(milk)).json()

    fetched = _items_by_name(client, lst["id"])["Leche"]
    assert fetched["purchase_ends_at"] == closed["closed_at"]
    assert fetched["purchase_ends_at"] != closed["tears_off_at"]


def test_closing_sends_no_push(client: TestClient):
    """A close records a shop that already happened. Like the receipt apply,
    it must not buzz the household — even for the impulse buys it creates,
    which are born purchased rather than added-then-bought."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    with patch("app.services.push.notify_list_change") as notify:
        response = _close(
            client,
            lst["id"],
            store="Lidl",
            lines=_lines(milk),
            new_items=[{"name": "Chocolate negro", "price": 3.18}],
        )

    assert response.status_code == 200
    notify.assert_not_called()


def _post_raw_json(client: TestClient, url: str, body: str):
    # httpx's `json=` kwarg serialises with allow_nan=False and refuses to
    # build a request containing inf/nan at all — which is exactly why the
    # *server* needs its own rejection: a client not built on httpx (or on
    # Python's stdlib json, which emits Infinity/NaN by default) can still
    # send one. Raw bytes let this test reach the server instead of failing
    # client-side before the request is built.
    return client.post(url, content=body.encode(), headers={"content-type": "application/json"})


def test_a_nan_or_infinite_total_is_rejected(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    for bad in ("NaN", "Infinity"):
        body = f'{{"store": "Lidl", "total": {bad}, "lines": [{{"item_id": "{milk["id"]}"}}]}}'
        response = _post_raw_json(client, f"/lists/{lst['id']}/purchases/close", body)
        assert response.status_code == 422, bad


def test_a_line_with_a_nan_price_is_rejected(client: TestClient):
    """Not merely an untidy error: Postgres stores NaN, and the items feed
    then fails to serialize for everyone on the list."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    body = json.dumps({"store": "Lidl", "lines": [{"item_id": milk["id"], "price": float("nan")}]})
    response = _post_raw_json(client, f"/lists/{lst['id']}/purchases/close", body)

    assert response.status_code == 422
    assert _items_by_name(client, lst["id"])["Leche"]["price"] is None


def test_a_negative_price_or_total_is_rejected(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    for body in (
        {"store": "Lidl", "total": -1.0, "lines": _lines(milk)},
        {"store": "Lidl", "lines": [{"item_id": milk["id"], "price": -5.0}]},
        {"store": "Lidl", "lines": _lines(milk), "new_items": [{"name": "Choc", "price": -3.0}]},
    ):
        response = client.post(f"/lists/{lst['id']}/purchases/close", json=body)
        assert response.status_code == 422, body
    # Refused before anything was written: no half-applied sheet.
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Leche"]["price"] is None
    assert "Choc" not in fetched


def test_a_unit_without_an_amount_is_rejected(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    for body in (
        {"store": "Lidl", "lines": [{"item_id": milk["id"], "price_per": "KILOGRAM"}]},
        {
            "store": "Lidl",
            "lines": _lines(milk),
            "new_items": [{"name": "Queso", "price_per": "KILOGRAM"}],
        },
    ):
        response = client.post(f"/lists/{lst['id']}/purchases/close", json=body)
        assert response.status_code == 422, body
    assert "Queso" not in _items_by_name(client, lst["id"])


def test_a_missing_empty_or_absurdly_long_store_is_rejected(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    for body in (
        {"lines": _lines(milk)},
        {"store": "", "lines": _lines(milk)},
        {"store": "x" * 101, "lines": _lines(milk)},
    ):
        response = client.post(f"/lists/{lst['id']}/purchases/close", json=body)
        assert response.status_code == 422, body


def test_a_close_with_too_many_lines_is_rejected(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = _close(
        client,
        lst["id"],
        store="Lidl",
        lines=[{"item_id": f"item-{i}"} for i in range(201)],
    )

    assert response.status_code == 422
