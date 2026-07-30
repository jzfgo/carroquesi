from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import List, Purchase


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
        json={"store": "Lidl", "total": 5.0, "lines": [{"item_id": milk["id"]}]},
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

    response = client.post(f"/lists/{lst['id']}/purchases/close", json={"store": "Lidl"})

    assert response.status_code == 409


def test_naming_an_item_already_filed_on_another_ticket_returns_400(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"]}]},
    )

    # The milk is on Lidl's ticket now. It cannot also be on Mercadona's.
    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "lines": [{"item_id": milk["id"]}, {"item_id": bread["id"]}],
        },
    )

    assert response.status_code == 400


def test_a_line_naming_an_item_that_no_longer_exists_is_ignored(client: TestClient):
    """Someone else deleted it while the sheet was open.

    The household is standing at the door with a full trolley. Losing the
    whole close over one row that went away is worse than filing the rest.
    """
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Lidl",
            "lines": [{"item_id": milk["id"]}, {"item_id": "does-not-exist"}],
        },
    )

    assert response.status_code == 200


def test_a_line_naming_an_item_on_another_list_is_ignored(
    client: TestClient, other_client: TestClient
):
    """An item id is not proof of access to the item it names.

    Membership was checked against the list in the path. A line is skipped
    the same way a missing one is, so the close still files what it may.
    """
    mine = _create_list(client)
    _tap(client, mine["id"], "Leche")
    theirs = other_client.post("/lists", json={"name": "Vecinos"}).json()
    their_bread = other_client.post(f"/lists/{theirs['id']}/items", json={"name": "Pan"}).json()

    response = client.post(
        f"/lists/{mine['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": their_bread["id"], "price": 9.99}]},
    )

    assert response.status_code == 200
    fetched = other_client.get(f"/lists/{theirs['id']}/items").json()[0]
    assert fetched["purchased"] is False
    assert fetched["price"] is None


def test_a_non_member_cannot_close(client: TestClient, other_client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = other_client.post(f"/lists/{lst['id']}/purchases/close", json={"store": "Lidl"})

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
        json={
            "store": "Lidl",
            "total": 14.60,
            "lines": [{"item_id": milk["id"]}, {"item_id": bread["id"]}],
        },
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


def _post_raw_json(client: TestClient, url: str, body: str):
    # httpx's `json=` kwarg serialises with allow_nan=False and refuses to
    # build a request containing inf/nan at all -- which is exactly why the
    # *server* needs its own rejection: a client not built on httpx (or
    # Python's stdlib json, which allows Infinity/NaN by default) can still
    # send one. Posting raw bytes is what lets this test reach the server
    # instead of failing client-side before the request is even built.
    return client.post(url, content=body.encode(), headers={"content-type": "application/json"})


def test_closing_with_an_infinite_total_is_rejected(client: TestClient):
    """`float('inf') >= 0` is true, so a bare `ge=0` constraint would let a
    non-finite total round-trip through trips.close() and back out in
    PurchaseRead. Checked in the router rather than the schema -- see
    PurchaseClose.total's docstring for why a schema-level constraint that
    can reject a non-finite value crashes FastAPI's own validation-error
    handler instead of cleanly returning 422.
    """
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = _post_raw_json(
        client,
        f"/lists/{lst['id']}/purchases/close",
        '{"store": "Lidl", "total": Infinity}',
    )

    assert response.status_code == 422


def test_closing_with_a_nan_total_is_rejected(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = _post_raw_json(
        client,
        f"/lists/{lst['id']}/purchases/close",
        '{"store": "Lidl", "total": NaN}',
    )

    assert response.status_code == 422


def test_closing_with_an_absurdly_long_store_name_is_rejected(client: TestClient):
    """`store` is free text that ends up rendering in a ticket header --
    unlike `total`, unbounded here is a rendering hazard, not a NaN-shaped
    footgun, so a plain schema-level max_length is the right tool.
    """
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "x" * 101},
    )

    assert response.status_code == 422


def test_a_close_with_too_many_lines_is_rejected(client: TestClient):
    """`lines` and `new_items` are the two fields here that can carry an
    unbounded payload -- `store` and `total` are both already bounded -- so
    they need the same schema-level max_length guard.
    """
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": f"item-{i}"} for i in range(201)]},
    )

    assert response.status_code == 422


def test_closing_without_a_store_is_rejected(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(f"/lists/{lst['id']}/purchases/close", json={"total": 5.0})

    assert response.status_code == 422


def test_closing_with_an_empty_store_is_rejected(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(f"/lists/{lst['id']}/purchases/close", json={"store": ""})

    assert response.status_code == 422


def test_a_line_prices_the_item_it_names(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Lidl",
            "lines": [{"item_id": milk["id"], "price": 1.19, "quantity": "6 ud"}],
        },
    )

    assert response.status_code == 200
    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Leche"]["price"] == 1.19
    assert fetched["Leche"]["price_store"] == "Lidl"
    assert fetched["Leche"]["purchased_quantity"] == "6 ud"


def test_a_line_with_no_price_is_saved_bought_without_one(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"]}]},
    )

    assert response.status_code == 200
    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Leche"]["price"] is None
    assert fetched["Leche"]["purchased"] is True


def test_a_new_item_is_created_already_bought_and_on_the_ticket(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Lidl",
            "lines": [],
            "new_items": [{"name": "Chocolate negro", "price": 3.18, "quantity": "2"}],
        },
    )

    assert response.status_code == 200
    trip_id = response.json()["id"]
    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    choc = fetched["Chocolate negro"]
    assert choc["purchased"] is True
    assert choc["price"] == 3.18
    assert choc["purchase_id"] == trip_id
    # Never tapped, so it was never in the cart -- and the milk that was is
    # not on this ticket, because no line named it.
    assert fetched["Leche"]["purchase_id"] != trip_id


def test_ticking_an_item_that_was_never_tapped_marks_it_bought(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")
    eggs = client.post(f"/lists/{lst['id']}/items", json={"name": "Huevos"}).json()
    assert eggs["purchased"] is False

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": eggs["id"], "price": 2.40}]},
    )

    assert response.status_code == 200
    trip_id = response.json()["id"]
    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Huevos"]["purchased"] is True
    assert fetched["Huevos"]["purchase_id"] == trip_id


def test_an_unticked_cart_item_stays_in_the_cart(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"], "price": 1.19}]},
    )

    assert response.status_code == 200
    closed_id = response.json()["id"]
    fetched = {i["name"]: i for i in client.get(f"/lists/{lst['id']}/items").json()}
    assert fetched["Pan"]["purchase_id"] == bread["purchase_id"]
    assert fetched["Pan"]["purchase_id"] != closed_id
    assert fetched["Pan"]["purchase_filed"] is False


def test_closing_a_torn_off_trip_by_id(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    # Force the trip to have torn off: the endpoint must still reach it.
    trip = session.get(Purchase, milk["purchase_id"])
    trip.tears_off_at = datetime(2026, 1, 1, 0, 0)
    session.add(trip)
    session.commit()

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "purchase_id": milk["purchase_id"],
            "store": "Mercadona",
            "lines": [{"item_id": milk["id"], "price": 1.19}],
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == milk["purchase_id"]
    assert response.json()["store"] == "Mercadona"


def test_naming_a_trip_that_belongs_to_another_list_returns_409(
    client: TestClient, other_client: TestClient, session: Session
):
    """Membership was checked against the list in the path, never against the
    trip id the caller supplied. Without the guard this call would close a
    stranger's ticket.
    """
    mine = _create_list(client)
    _tap(client, mine["id"], "Leche")
    theirs = other_client.post("/lists", json={"name": "Vecinos"}).json()
    their_milk = _tap(other_client, theirs["id"], "Leche")

    response = client.post(
        f"/lists/{mine['id']}/purchases/close",
        json={"purchase_id": their_milk["purchase_id"], "store": "Lidl"},
    )

    assert response.status_code == 409
    session.expire_all()
    assert session.get(Purchase, their_milk["purchase_id"]).closed_at is None


def test_closing_works_without_the_receipt_scanning_flag(client: TestClient):
    """The manual path is the one a household without the AI flag has.

    Worth its own test because `lines` and `new_items` look like the receipt
    endpoint's payload, and a later refactor that shares code between them is
    exactly how that endpoint's feature gate gets copied in by accident.
    """
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"], "price": 1.19}]},
    )

    assert response.status_code == 200
