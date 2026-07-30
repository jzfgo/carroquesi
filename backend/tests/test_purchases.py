import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, Purchase, ReceiptNameMapping, ReceiptScan
from app.db.models import UserFeature as _UserFeature
from app.services import trips


def _create_list(client):
    return client.post("/lists", json={"name": "Casa"}).json()


def _tap(client, list_id: str, name: str) -> dict:
    item = client.post(f"/lists/{list_id}/items", json={"name": name}).json()
    return client.patch(f"/lists/{list_id}/items/{item['id']}", json={"purchased": True}).json()


def _items_by_name(client, list_id: str) -> dict:
    return {i["name"]: i for i in client.get(f"/lists/{list_id}/items").json()}


def _days_ago(days: int) -> datetime:
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)


def _tap_at(client, list_id: str, name: str, when: datetime) -> dict:
    """A tap dated `when`, which files into that day's trip.

    Used to build a trip that has torn off but was never reconciled — what a
    household is looking at when it writes down last night's shop the next
    morning. Built through the real tap path on purpose: a trip whose
    `tears_off_at` was edited by hand, without its `opened_at`, is a shape the
    app cannot produce, and the close endpoint reads `opened_at` to find the
    trip an impulse buy belongs to.
    """
    item = client.post(f"/lists/{list_id}/items", json={"name": name}).json()
    return client.patch(
        f"/lists/{list_id}/items/{item['id']}",
        json={"purchased": True, "purchased_at": when.isoformat()},
    ).json()


def _enable_receipt_flag(session: Session, user) -> None:
    session.add(
        _UserFeature(
            user_id=user.id,
            feature="ai_receipt_scanning",
            enabled=True,
            granted_by="admin",
        )
    )
    session.commit()


def _make_scan(session: Session, list_id: str, user_id: str) -> ReceiptScan:
    scan = ReceiptScan(list_id=list_id, scanned_by=user_id)
    session.add(scan)
    session.commit()
    session.refresh(scan)
    return scan


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

    fetched = _items_by_name(client, lst["id"])
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


def test_a_vanished_line_is_skipped_and_the_rest_of_the_sheet_still_files(client: TestClient):
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
    # The rest of the sheet went through -- the point is that the close still
    # files what it can, not merely that nothing raised.
    fetched = client.get(f"/lists/{lst['id']}/items").json()[0]
    assert fetched["id"] == milk["id"]
    assert fetched["purchase_id"] == response.json()["id"]


def test_a_sheet_whose_every_line_vanished_closes_nothing(client: TestClient):
    """The dangerous half of the same story.

    Naming nothing at all means "close the whole cart". A sheet whose lines
    have all been deleted must not be read that way: the household ticked one
    row, and it would get every row filed under a total that covers none of
    them, with no error to notice. The offline queue replaying a close after
    the items went away is the ordinary way to arrive here.
    """
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "total": 3.0, "lines": [{"item_id": "does-not-exist"}]},
    )

    assert response.status_code == 409
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Leche"]["purchase_id"] == milk["purchase_id"]
    assert fetched["Pan"]["purchase_id"] == bread["purchase_id"]
    assert fetched["Leche"]["purchase_filed"] is False
    assert fetched["Pan"]["purchase_filed"] is False


def test_a_line_naming_an_item_on_another_list_does_not_touch_it(
    client: TestClient, other_client: TestClient
):
    """An item id is not proof of access to the item it names.

    Membership was checked against the list in the path, so a line reaching
    outside it is skipped the same way a deleted one is — and the close goes
    on to file the lines that were the caller's to name.
    """
    mine = _create_list(client)
    milk = _tap(client, mine["id"], "Leche")
    theirs = other_client.post("/lists", json={"name": "Vecinos"}).json()
    their_bread = other_client.post(f"/lists/{theirs['id']}/items", json={"name": "Pan"}).json()

    response = client.post(
        f"/lists/{mine['id']}/purchases/close",
        json={
            "store": "Lidl",
            "lines": [
                {"item_id": milk["id"]},
                {"item_id": their_bread["id"], "price": 9.99},
            ],
        },
    )

    assert response.status_code == 200
    fetched = other_client.get(f"/lists/{theirs['id']}/items").json()[0]
    assert fetched["purchased"] is False
    assert fetched["price"] is None
    assert _items_by_name(client, mine["id"])["Leche"]["purchase_id"] == response.json()["id"]


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

    fetched = _items_by_name(client, lst["id"])
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
    fetched = _items_by_name(client, lst["id"])
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
    fetched = _items_by_name(client, lst["id"])
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
    fetched = _items_by_name(client, lst["id"])
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
    fetched = _items_by_name(client, lst["id"])
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
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Pan"]["purchase_id"] == bread["purchase_id"]
    assert fetched["Pan"]["purchase_id"] != closed_id
    assert fetched["Pan"]["purchase_filed"] is False


def test_closing_a_torn_off_trip_by_id(client: TestClient):
    lst = _create_list(client)
    # A trip that tore off days ago and nobody said what it was. The endpoint
    # must still reach it.
    milk = _tap_at(client, lst["id"], "Leche", _days_ago(3))

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
    # The test only means anything if the trip really had torn off, so say so
    # rather than trust the fixture to keep being backdated.
    tears_off_at = datetime.fromisoformat(response.json()["tears_off_at"])
    assert tears_off_at < datetime.now(UTC).replace(tzinfo=None)


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


def test_an_impulse_buy_on_a_backdated_sheet_joins_the_trip_being_closed(client: TestClient):
    """The sheet's date says when the shop was, not which trip it was.

    Nothing names a trip here, so the one being closed is today's open cart,
    and the impulse buy has to land in it however the date control is set.
    """
    two_days_ago = _days_ago(2)
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Lidl",
            "purchased_at": two_days_ago.isoformat(),
            "lines": [{"item_id": milk["id"]}],
            "new_items": [{"name": "Chocolate negro", "price": 3.18}],
        },
    )

    assert response.status_code == 200
    trip = response.json()
    assert trip["id"] == milk["purchase_id"]
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Chocolate negro"]["purchase_id"] == trip["id"]
    assert fetched["Leche"]["purchase_id"] == trip["id"]
    # The date still did its own job: it dated the buy, and through it the
    # ticket, without deciding which ticket that was.
    assert datetime.fromisoformat(fetched["Chocolate negro"]["purchased_at"]).date() == (
        two_days_ago.date()
    )
    assert datetime.fromisoformat(trip["opened_at"]).date() == two_days_ago.date()


def test_writing_down_a_torn_off_trip_takes_its_impulse_buys_with_it(client: TestClient):
    """Last night's shop, written down this morning, with a bar of chocolate
    nobody had put on the list. The impulse buy belongs to the trip being
    named, not to today's cart, which is a different shop entirely.
    """
    lst = _create_list(client)
    milk = _tap_at(client, lst["id"], "Leche", _days_ago(3))
    today = _tap(client, lst["id"], "Pan")
    assert milk["purchase_id"] != today["purchase_id"]

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "purchase_id": milk["purchase_id"],
            "store": "Mercadona",
            "lines": [{"item_id": milk["id"], "price": 1.19}],
            "new_items": [{"name": "Chocolate negro", "price": 3.18}],
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == milk["purchase_id"]
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Chocolate negro"]["purchase_id"] == milk["purchase_id"]
    # Today's cart is a different shop and must be left open.
    assert fetched["Pan"]["purchase_id"] == today["purchase_id"]
    assert fetched["Pan"]["purchase_filed"] is False


def test_a_named_trip_wins_over_the_sheets_date(client: TestClient):
    """Both controls are set, and they disagree. The trip decides where the
    impulse buy is filed; the date only decides what it is stamped with.
    """
    ten_days_ago = _days_ago(10)
    lst = _create_list(client)
    milk = _tap_at(client, lst["id"], "Leche", _days_ago(3))

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "purchase_id": milk["purchase_id"],
            "purchased_at": ten_days_ago.isoformat(),
            "store": "Mercadona",
            "lines": [{"item_id": milk["id"]}],
            "new_items": [{"name": "Chocolate negro"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == milk["purchase_id"]
    fetched = _items_by_name(client, lst["id"])
    choc = fetched["Chocolate negro"]
    assert choc["purchase_id"] == milk["purchase_id"]
    assert datetime.fromisoformat(choc["purchased_at"]).date() == ten_days_ago.date()


def test_ticking_a_never_tapped_item_onto_a_torn_off_trip(client: TestClient):
    """The same rule for a line as for an impulse buy: something remembered
    only while writing the shop down joins the trip being written down.
    """
    lst = _create_list(client)
    milk = _tap_at(client, lst["id"], "Leche", _days_ago(3))
    eggs = client.post(f"/lists/{lst['id']}/items", json={"name": "Huevos"}).json()

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "purchase_id": milk["purchase_id"],
            "store": "Mercadona",
            "lines": [{"item_id": milk["id"]}, {"item_id": eggs["id"], "price": 2.40}],
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == milk["purchase_id"]
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Huevos"]["purchased"] is True
    assert fetched["Huevos"]["purchase_id"] == milk["purchase_id"]


def test_a_line_with_a_negative_price_is_rejected(client: TestClient):
    """The sheet prices items, so it needs the rules ItemCreate already has.

    Same request, same quantity: an amount the item endpoint refuses cannot
    be accepted here just because it arrived on a line instead.
    """
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"], "price": -5.0}]},
    )

    assert response.status_code == 422
    assert _items_by_name(client, lst["id"])["Leche"]["price"] is None


def test_a_new_item_with_a_negative_price_is_rejected(client: TestClient):
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "new_items": [{"name": "Chocolate negro", "price": -3.18}]},
    )

    assert response.status_code == 422
    # Refused before anything was written, so no half-applied sheet is left.
    assert "Chocolate negro" not in _items_by_name(client, lst["id"])


def test_a_line_with_a_nan_price_is_rejected(client: TestClient):
    """Not merely an untidy error. Postgres stores NaN, and the items feed
    then fails to serialize for everyone on the list -- one crafted request
    would take the list down for the household.
    """
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    # json.dumps emits a bare NaN by default, which is exactly the kind of
    # client _post_raw_json exists to imitate.
    body = json.dumps({"store": "Lidl", "lines": [{"item_id": milk["id"], "price": float("nan")}]})
    response = _post_raw_json(client, f"/lists/{lst['id']}/purchases/close", body)

    assert response.status_code == 422
    assert _items_by_name(client, lst["id"])["Leche"]["price"] is None


def test_a_line_priced_by_the_kilo_with_no_price_is_rejected(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"], "price_per": "KILOGRAM"}]},
    )

    assert response.status_code == 422


def test_a_new_item_priced_by_the_kilo_with_no_price_is_rejected(client: TestClient):
    """A unit with no amount to apply it to. `POST /lists/{id}/items` returns
    422 for exactly this payload, and a sheet inventing the item is not a
    reason to store what that endpoint refuses.
    """
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "new_items": [{"name": "Queso", "price_per": "KILOGRAM"}]},
    )

    assert response.status_code == 422
    assert "Queso" not in _items_by_name(client, lst["id"])


def test_listing_purchases_returns_newest_first(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "total": 14.60, "lines": [{"item_id": milk["id"]}]},
    )
    bread = _tap(client, lst["id"], "Pan")
    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Mercadona", "lines": [{"item_id": bread["id"]}]},
    )

    response = client.get(f"/lists/{lst['id']}/purchases")

    assert response.status_code == 200
    body = response.json()
    assert [p["store"] for p in body] == ["Mercadona", "Lidl"]
    assert body[1]["total"] == 14.60
    # The Mercadona close named no total, so its header prints an
    # approximation rather than a figure.
    assert body[0]["total"] is None


def test_listing_purchases_honours_the_limit(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"]}]},
    )
    bread = _tap(client, lst["id"], "Pan")
    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Mercadona", "lines": [{"item_id": bread["id"]}]},
    )

    response = client.get(f"/lists/{lst['id']}/purchases", params={"limit": 1})

    assert response.status_code == 200
    assert [p["store"] for p in response.json()] == ["Mercadona"]


def test_listing_purchases_rejects_a_limit_outside_the_bounds(client: TestClient):
    lst = _create_list(client)

    for limit in (0, -1, 101):
        response = client.get(f"/lists/{lst['id']}/purchases", params={"limit": limit})
        assert response.status_code == 422, limit


def test_listing_purchases_includes_the_trip_still_in_the_cart(client: TestClient):
    """The cart is a trip too, and its group needs a header like any other.

    It has no store and no total because nobody has said what the shop was
    yet, which is what makes the header print an approximation.
    """
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    _tap(client, lst["id"], "Pan")
    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Lidl", "total": 5.0, "lines": [{"item_id": milk["id"]}]},
    )

    body = client.get(f"/lists/{lst['id']}/purchases").json()

    fetched = _items_by_name(client, lst["id"])
    still_in_the_cart = fetched["Pan"]["purchase_id"]
    by_id = {p["id"]: p for p in body}
    assert set(by_id) == {still_in_the_cart, fetched["Leche"]["purchase_id"]}
    open_trip = by_id[still_in_the_cart]
    assert open_trip["closed_at"] is None
    assert open_trip["store"] is None
    assert open_trip["total"] is None


def test_listing_purchases_breaks_a_tie_the_same_way_every_time(
    client: TestClient, session: Session
):
    """Two trips can share an opened_at, and the order must not wander.

    A household writing down yesterday's two shops dates both closes the same
    day, which gives both trips the same opened_at. Which of the two comes
    first does not matter; that it is the same on every poll does, or the
    headers reshuffle while someone is reading them.

    The ids are chosen rather than generated. A real close would produce two
    random ones, and the row order would then agree with the tiebreaker about
    half the time -- a test that passes or fails by coin toss. Both rows are
    still shapes the app can produce: closed, so the one-open-trip-per-list
    index is not violated.
    """
    lst = _create_list(client)
    same_moment = _days_ago(1)
    for purchase_id, store in (("aaa", "Lidl"), ("bbb", "Mercadona")):
        session.add(
            Purchase(
                id=purchase_id,
                list_id=lst["id"],
                opened_at=same_moment,
                tears_off_at=same_moment + timedelta(days=1),
                closed_at=same_moment,
                store=store,
            )
        )
    session.commit()

    body = client.get(f"/lists/{lst['id']}/purchases").json()

    assert [p["id"] for p in body] == ["bbb", "aaa"]


def test_listing_purchases_shows_only_the_list_asked_for(client: TestClient, second_list):
    """One household can belong to several lists, and each has its own tickets."""
    mine = _create_list(client)
    milk = _tap(client, mine["id"], "Leche")
    client.post(
        f"/lists/{mine['id']}/purchases/close",
        json={"store": "Lidl", "lines": [{"item_id": milk["id"]}]},
    )
    bread = _tap(client, second_list["id"], "Pan")
    client.post(
        f"/lists/{second_list['id']}/purchases/close",
        json={"store": "Mercadona", "lines": [{"item_id": bread["id"]}]},
    )

    response = client.get(f"/lists/{mine['id']}/purchases")

    assert response.status_code == 200
    assert [p["store"] for p in response.json()] == ["Lidl"]


def test_listing_purchases_requires_membership(client: TestClient, other_client: TestClient):
    lst = _create_list(client)

    response = other_client.get(f"/lists/{lst['id']}/purchases")

    assert response.status_code == 403


def test_a_close_queued_last_night_still_files_it_the_next_morning(client: TestClient):
    """The whole shop happened offline, and the queue drains after midnight.

    Nothing reached the server while the household was in the aisle, so the
    taps replay first and land in *last night's* trip -- born already torn
    off. The close follows, naming no trip, because at the moment the button
    was pressed there was no trip id to name: the taps had not reached the
    server either. Resolving it from `now` looks for a trip that is still
    open and finds nothing, which drops the sheet and everything typed into
    it. The date the sheet carries is what says which shop this was.
    """
    lst = _create_list(client)
    last_night = _days_ago(1)
    milk = _tap_at(client, lst["id"], "Leche", last_night)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Lidl",
            "purchased_at": last_night.isoformat(),
            "lines": [{"item_id": milk["id"], "price": 1.19}],
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == milk["purchase_id"]
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Leche"]["purchase_filed"] is True
    assert fetched["Leche"]["price"] == 1.19


def test_an_impulse_buy_on_a_close_queued_last_night_joins_the_same_trip(
    client: TestClient,
):
    """The same replay, with something bought that was never on the list.

    Anchoring the new row on `now` would file it into today's trip while the
    ticked rows sit in last night's, and the close would then refuse the
    whole sheet for naming items from two trips.
    """
    lst = _create_list(client)
    last_night = _days_ago(1)
    milk = _tap_at(client, lst["id"], "Leche", last_night)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Lidl",
            "purchased_at": last_night.isoformat(),
            "lines": [{"item_id": milk["id"]}],
            "new_items": [{"name": "Chocolate negro", "price": 3.18}],
        },
    )

    assert response.status_code == 200
    trip_id = response.json()["id"]
    assert trip_id == milk["purchase_id"]
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Chocolate negro"]["purchase_id"] == trip_id


def test_a_backdated_sheet_of_only_new_things_still_files(client: TestClient):
    """Nothing was on the list and nothing had been tapped.

    There is no trip to resolve when the request arrives, so the target is
    whatever the impulse buys create — and they create it on the sheet's own
    day, which for a backdated sheet has already torn off. Looking for the
    trip that is open *now* would not find it.
    """
    lst = _create_list(client)
    last_night = _days_ago(1)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Lidl",
            "purchased_at": last_night.isoformat(),
            "new_items": [{"name": "Chocolate negro", "price": 3.18}],
        },
    )

    assert response.status_code == 200
    trip_id = response.json()["id"]
    fetched = _items_by_name(client, lst["id"])
    assert fetched["Chocolate negro"]["purchase_id"] == trip_id
    assert fetched["Chocolate negro"]["purchase_filed"] is True


def test_naming_an_empty_purchase_id_is_refused_like_any_other_unresolvable_one(
    client: TestClient,
):
    """The one spelling of "a trip I cannot resolve" that used to slip through.

    An empty string is falsy, so a truthiness test read it as "named nothing"
    and quietly closed whatever the date resolved to. Every other unresolvable
    id is refused, and this one is not different.
    """
    lst = _create_list(client)
    _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"purchase_id": "", "store": "Lidl"},
    )

    assert response.status_code == 409
    assert _items_by_name(client, lst["id"])["Leche"]["purchase_filed"] is False


def test_close_upserts_a_mapping_under_the_body_store(client: TestClient, session: Session, user):
    """A close mapping has no `store` of its own — it is learned for `body.store`,
    the one shop the whole ticket belongs to."""
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "lines": [{"item_id": milk["id"]}],
            "mappings": [
                {"receipt_name": "LECHE ENT 1L", "item_name": "Leche entera", "item_brand": None}
            ],
        },
    )

    assert response.status_code == 200
    session.expire_all()
    mapping = session.exec(
        select(ReceiptNameMapping).where(ReceiptNameMapping.receipt_name == "LECHE ENT 1L")
    ).one()
    assert mapping.store == "Mercadona"
    assert mapping.item_name == "Leche entera"
    assert mapping.use_count == 1


def test_a_repeated_mapping_bumps_use_count_instead_of_duplicating(
    client: TestClient, session: Session, user
):
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")

    body = {
        "store": "Mercadona",
        "mappings": [
            {"receipt_name": "LECHE ENT 1L", "item_name": "Leche entera", "item_brand": None}
        ],
    }
    client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={**body, "lines": [{"item_id": milk["id"]}]},
    )
    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={**body, "lines": [{"item_id": bread["id"]}]},
    )

    assert response.status_code == 200
    session.expire_all()
    mappings = session.exec(
        select(ReceiptNameMapping).where(ReceiptNameMapping.receipt_name == "LECHE ENT 1L")
    ).all()
    assert len(mappings) == 1
    assert mappings[0].use_count == 2


def test_201_mappings_is_a_422(client: TestClient, session: Session, user):
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    mapping = {"receipt_name": "X", "item_name": "Y", "item_brand": None}

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Mercadona", "mappings": [mapping] * 201},
    )

    assert response.status_code == 422


def test_close_returns_403_when_scan_id_sent_and_flag_is_off(client: TestClient):
    lst = _create_list(client)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={"store": "Mercadona", "scan_id": "some-scan-id"},
    )

    assert response.status_code == 403


def test_close_returns_403_when_mappings_sent_and_flag_is_off(client: TestClient):
    lst = _create_list(client)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "mappings": [
                {"receipt_name": "LECHE ENT 1L", "item_name": "Leche entera", "item_brand": None}
            ],
        },
    )

    assert response.status_code == 403


def test_scan_linked_close_survives_a_backdate_past_the_manual_floor(
    client: TestClient, session: Session, user
):
    """A receipt is a record of something that already happened, however long
    ago. It must not be floored the way a hand-typed date is."""
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    scan = _make_scan(session, lst["id"], user.id)
    old_date = _days_ago(60)
    assert old_date < datetime.now(UTC).replace(tzinfo=None) - trips.MAX_BACKDATE

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "purchased_at": old_date.isoformat(),
            "scan_id": scan.id,
            "new_items": [{"name": "Leche", "price": 1.10}],
        },
    )

    assert response.status_code == 200
    item = _items_by_name(client, lst["id"])["Leche"]
    purchased_at = datetime.fromisoformat(item["purchased_at"])
    assert abs((purchased_at - old_date).total_seconds()) < 5


def test_an_empty_scan_id_is_treated_as_naming_no_scan(client: TestClient, session: Session, user):
    """An empty string is falsy, the same trap `purchase_id` has.

    `scan_id: ""` must not be read as "this is a scan-linked close" -- that
    would smuggle the unfloored date rule past a value that links to no scan
    and leaves no audit row behind. It gets the hand-typed date's floor, same
    as sending no scan_id at all.
    """
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    old_date = _days_ago(60)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "purchased_at": old_date.isoformat(),
            "scan_id": "",
            "new_items": [{"name": "Leche", "price": 1.10}],
        },
    )

    assert response.status_code == 200
    item = _items_by_name(client, lst["id"])["Leche"]
    purchased_at = datetime.fromisoformat(item["purchased_at"])
    floor = datetime.now(UTC).replace(tzinfo=None) - trips.MAX_BACKDATE
    assert purchased_at > old_date
    assert abs((purchased_at - floor).total_seconds()) < 5


def test_a_plain_close_still_floors_the_same_old_date(client: TestClient, session: Session, user):
    """Without a scan_id this is a hand-typed date, which carries a live
    clock's risks and stays floored at the backdate limit."""
    lst = _create_list(client)
    old_date = _days_ago(60)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "purchased_at": old_date.isoformat(),
            "new_items": [{"name": "Leche", "price": 1.10}],
        },
    )

    assert response.status_code == 200
    item = _items_by_name(client, lst["id"])["Leche"]
    purchased_at = datetime.fromisoformat(item["purchased_at"])
    floor = datetime.now(UTC).replace(tzinfo=None) - trips.MAX_BACKDATE
    assert purchased_at > old_date
    assert abs((purchased_at - floor).total_seconds()) < 5


def test_a_future_purchased_at_is_clamped_with_a_scan(client: TestClient, session: Session, user):
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    scan = _make_scan(session, lst["id"], user.id)
    future = datetime.now(UTC).replace(tzinfo=None) + timedelta(days=400)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "purchased_at": future.isoformat(),
            "scan_id": scan.id,
            "new_items": [{"name": "Leche", "price": 1.10}],
        },
    )

    assert response.status_code == 200
    item = _items_by_name(client, lst["id"])["Leche"]
    purchased_at = datetime.fromisoformat(item["purchased_at"])
    assert purchased_at <= datetime.now(UTC).replace(tzinfo=None)


def test_a_future_purchased_at_is_clamped_without_a_scan(client: TestClient):
    lst = _create_list(client)
    future = datetime.now(UTC).replace(tzinfo=None) + timedelta(days=400)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "purchased_at": future.isoformat(),
            "new_items": [{"name": "Leche", "price": 1.10}],
        },
    )

    assert response.status_code == 200
    item = _items_by_name(client, lst["id"])["Leche"]
    purchased_at = datetime.fromisoformat(item["purchased_at"])
    assert purchased_at <= datetime.now(UTC).replace(tzinfo=None)


def test_scan_linked_close_sets_purchase_id_and_items_updated_on_the_scan(
    client: TestClient, session: Session, user
):
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    scan = _make_scan(session, lst["id"], user.id)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "scan_id": scan.id,
            "lines": [{"item_id": milk["id"]}],
            "new_items": [{"name": "Chocolate negro", "price": 1.80}],
        },
    )

    assert response.status_code == 200
    purchase_id = response.json()["id"]
    session.expire_all()
    refetched = session.get(ReceiptScan, scan.id)
    assert refetched.purchase_id == purchase_id
    assert refetched.items_updated == 2


def test_a_scan_id_naming_a_scan_on_another_list_is_ignored(
    client: TestClient, session: Session, user
):
    """The shop is the thing being recorded. Losing the audit link is not
    worth losing the close."""
    _enable_receipt_flag(session, user)
    lst = _create_list(client)
    other_lst = _create_list(client)
    other_scan = _make_scan(session, other_lst["id"], user.id)

    response = client.post(
        f"/lists/{lst['id']}/purchases/close",
        json={
            "store": "Mercadona",
            "scan_id": other_scan.id,
            "new_items": [{"name": "Leche", "price": 1.10}],
        },
    )

    assert response.status_code == 200
    session.expire_all()
    refetched = session.get(ReceiptScan, other_scan.id)
    assert refetched.purchase_id is None
    assert refetched.items_updated == 0
