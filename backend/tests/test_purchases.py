import json
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, ListItem, ListStore, Purchase

# The date helpers below declare Europe/Madrid, so "today" must be read in that
# same zone — not from the machine clock. Reading the machine's local date makes
# the suite flip on runners whose zone differs from Madrid, in the hours when the
# two calendars disagree.
_MADRID = ZoneInfo("Europe/Madrid")


def _client_today() -> date:
    return datetime.now(_MADRID).date()


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
    """The trip an item is filed under, read fresh from the row. ItemRead
    carries purchase_id too, but the dicts these tests hold were captured
    before the writes under test."""
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


def test_a_close_line_corrects_the_products_name_and_brand(client: TestClient, session: Session):
    """The adjust-product editor (10d) can fix a line at close time; the
    correction rides in the close payload and lands on the claimed item."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Lehce")  # a typo to fix on the sheet

    response = _close(
        client,
        lst["id"],
        store="Lidl",
        lines=[{"item_id": milk["id"], "name": "Leche entera", "brand": "Hacendado"}],
    )

    assert response.status_code == 200
    row = session.get(ListItem, milk["id"])
    session.refresh(row)
    assert row.name == "Leche entera"
    assert row.brand == "Hacendado"


def _close_dated(client: TestClient, list_id: str, day, **body):
    return client.post(
        f"/lists/{list_id}/purchases/close",
        json={"date": day.isoformat(), **body},
        headers={"X-Client-Timezone": str(_MADRID)},
    )


def test_a_back_dated_close_files_the_ticket_under_its_day(client: TestClient, session: Session):
    """«Hoy ▾» back-dated: the ticket's boundaries derive from the stated day,
    and closed_at is that day's tear-off (not now), so it sorts under it."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    day = _client_today() - timedelta(days=7)

    response = _close_dated(client, lst["id"], day, store="Lidl", lines=_lines(milk))

    assert response.status_code == 200
    body = response.json()
    assert body["closed_at"] == body["tears_off_at"]  # the day's tear-off, not now
    opened = datetime.fromisoformat(body["opened_at"])
    closed = datetime.fromisoformat(body["closed_at"])
    assert opened < closed  # the day's start precedes its tear-off
    assert closed < datetime.now(UTC).replace(tzinfo=None)  # a week ago, not today


def test_a_same_day_close_is_unchanged_by_the_date_extension(client: TestClient):
    """No date given → the old behaviour: closed at now, the tear-off still
    ahead (today's boundary)."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    body = _close(client, lst["id"], store="Lidl", lines=_lines(milk)).json()

    assert body["closed_at"] != body["tears_off_at"]
    assert datetime.fromisoformat(body["tears_off_at"]) > datetime.fromisoformat(body["closed_at"])


def test_a_close_dated_today_lands_closed_at_now_not_the_future_tearoff(client: TestClient):
    """The «Hoy ▾» control sends today's date on an ordinary close. closed_at
    must be the close instant, never tonight's tear-off: a future closed_at
    leaves the just-closed trip reading «still open» (is_open compares
    closed_at ?? tears_off_at to now), and the next close then finds nothing."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    body = _close_dated(client, lst["id"], _client_today(), store="Lidl", lines=_lines(milk)).json()

    closed = datetime.fromisoformat(body["closed_at"])
    tears = datetime.fromisoformat(body["tears_off_at"])
    now = datetime.now(UTC).replace(tzinfo=None)
    assert closed < tears  # not stamped at the future tear-off
    assert closed <= now  # the reconciliation instant, not ahead of now


def test_a_future_dated_close_is_rejected(client: TestClient):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    day = _client_today() + timedelta(days=1)

    assert _close_dated(client, lst["id"], day, store="Lidl", lines=_lines(milk)).status_code == 422


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


# --- The read side: the history page and one ticket's lines ---


def _page(client: TestClient, list_id: str, **params):
    return client.get(f"/lists/{list_id}/purchases", params=params)


def _backdate_close(session: Session, trip_id: str, days_ago: int) -> None:
    trip = session.get(Purchase, trip_id)
    trip.closed_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days_ago)
    session.add(trip)
    session.commit()


def test_the_page_puts_the_open_cart_first_then_newest_shop(client: TestClient, session: Session):
    lst = _create_list(client)
    # A shop nobody wrote down, five days back: its key is its tear-off.
    forgotten = _tap(client, lst["id"], "Aceitunas")
    torn_id = _tear_off(session, forgotten, days_ago=5)
    # Two written-down shops, two and one days back.
    milk = _tap(client, lst["id"], "Leche")
    older = _close(client, lst["id"], store="Lidl", total=14.60, lines=_lines(milk)).json()
    _backdate_close(session, older["id"], days_ago=2)
    bread = _tap(client, lst["id"], "Pan")
    newer = _close(client, lst["id"], store="Mercadona", lines=_lines(bread)).json()
    _backdate_close(session, newer["id"], days_ago=1)
    # Today's open cart.
    oil = _tap(client, lst["id"], "Aceite")
    cart_id = _pid(session, oil)

    response = _page(client, lst["id"])

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    assert [p["id"] for p in body["purchases"]] == [cart_id, newer["id"], older["id"], torn_id]
    # The torn-off proto-trip is honest about what nobody recorded.
    proto = body["purchases"][3]
    assert proto["closed_at"] is None
    assert proto["store"] is None
    assert proto["total"] is None
    assert proto["line_count"] == 1


def test_the_page_sums_a_provisional_items_total_from_priced_proto_lines(
    client: TestClient, session: Session
):
    """A proto-ticket has no confirmed total, but its priced lines give a
    provisional one — summed as `price * factor` (the line's real amount), not
    the raw price, so «≈ total» matches the rows below it."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche", quantity="12 ud")
    coffee = _tap(client, lst["id"], "Cafe", quantity="1 ud")
    torn_id = _tear_off(session, milk, days_ago=2)
    for item, price in ((milk, 1.90), (coffee, 3.29)):
        row = session.get(ListItem, item["id"])
        row.price = price
        row.price_per = None
        session.add(row)
    session.commit()

    body = _page(client, lst["id"]).json()

    (proto,) = [p for p in body["purchases"] if p["id"] == torn_id]
    assert proto["closed_at"] is None
    assert proto["total"] is None
    # 1,90 × 12 (multi-unit, not 1,90) + 3,29 × 1 = 26,09
    assert proto["items_total"] == 26.09


def test_the_page_leaves_items_total_null_when_no_line_is_priced(
    client: TestClient, session: Session
):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    torn_id = _tear_off(session, milk, days_ago=2)

    body = _page(client, lst["id"]).json()

    (proto,) = [p for p in body["purchases"] if p["id"] == torn_id]
    assert proto["items_total"] is None


def test_trips_sharing_a_boundary_tie_break_on_id(client: TestClient, session: Session):
    lst = _create_list(client)
    instant = datetime(2026, 7, 1, 12, 0, 0)
    boundary = datetime(2026, 7, 1, 22, 0, 0)
    for trip_id in ("trip-a", "trip-b"):
        session.add(
            Purchase(
                id=trip_id,
                list_id=lst["id"],
                opened_at=instant,
                tears_off_at=boundary,
                closed_at=instant,
                store="Lidl",
            )
        )
    session.commit()

    body = _page(client, lst["id"]).json()

    assert [p["id"] for p in body["purchases"]] == ["trip-b", "trip-a"]


def test_the_page_is_a_window_and_the_total_is_the_whole_list(client: TestClient, session: Session):
    lst = _create_list(client)
    for day, name in enumerate(["Leche", "Pan", "Aceite"], start=1):
        item = _tap(client, lst["id"], name)
        ticket = _close(client, lst["id"], store="Lidl", lines=_lines(item)).json()
        _backdate_close(session, ticket["id"], days_ago=day)

    first = _page(client, lst["id"], limit=2).json()
    assert first["total"] == 3
    assert len(first["purchases"]) == 2

    second = _page(client, lst["id"], offset=2, limit=2).json()
    assert second["total"] == 3
    assert len(second["purchases"]) == 1
    assert second["purchases"][0]["id"] not in {p["id"] for p in first["purchases"]}


def test_the_page_rejects_absurd_windows(client: TestClient):
    lst = _create_list(client)

    assert _page(client, lst["id"], limit=0).status_code == 422
    assert _page(client, lst["id"], limit=101).status_code == 422
    assert _page(client, lst["id"], offset=-1).status_code == 422


def test_a_ticket_emptied_by_an_unpurchase_counts_zero_lines(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    ticket = _close(client, lst["id"], store="Lidl", total=3.20, lines=_lines(milk)).json()
    # The write-grace window lets the fresh tap be reverted even though its
    # ticket is closed; the closed ticket itself stays, a historical record.
    undo = client.patch(f"/lists/{lst['id']}/items/{milk['id']}", json={"purchased": False})
    assert undo.status_code == 200

    body = _page(client, lst["id"]).json()

    (row,) = [p for p in body["purchases"] if p["id"] == ticket["id"]]
    assert row["line_count"] == 0


def test_has_receipt_reflects_a_linked_scan(client: TestClient, session: Session, user):
    from app.db.models import ReceiptScan

    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    scanned = _close(client, lst["id"], store="Lidl", lines=_lines(milk)).json()
    bread = _tap(client, lst["id"], "Pan")
    unscanned = _close(client, lst["id"], store="Dia", lines=_lines(bread)).json()
    # Two scans reconciled the same trip, and a third — the historic shape,
    # from before scans carried the link — reconciled none.
    session.add(ReceiptScan(list_id=lst["id"], scanned_by=user.id, purchase_id=scanned["id"]))
    session.add(ReceiptScan(list_id=lst["id"], scanned_by=user.id, purchase_id=scanned["id"]))
    session.add(ReceiptScan(list_id=lst["id"], scanned_by=user.id, purchase_id=None))
    session.commit()

    by_id = {p["id"]: p for p in _page(client, lst["id"]).json()["purchases"]}

    assert by_id[scanned["id"]]["has_receipt"] is True
    assert by_id[unscanned["id"]]["has_receipt"] is False


def test_a_non_member_cannot_read_the_page(client: TestClient, other_client: TestClient):
    lst = _create_list(client)

    assert other_client.get(f"/lists/{lst['id']}/purchases").status_code == 403


def test_a_tickets_lines_come_in_tap_order_with_the_boundary_stamped(
    client: TestClient, session: Session
):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    # Taps land microseconds apart; set the order beyond doubt. The bread
    # went into the cart first, so created_at alone would order it wrong.
    now = datetime.now(UTC).replace(tzinfo=None)
    session.get(ListItem, bread["id"]).purchased_at = now - timedelta(hours=2)
    session.get(ListItem, milk["id"]).purchased_at = now - timedelta(hours=1)
    session.commit()
    ticket = _close(client, lst["id"], store="Lidl", lines=_lines(milk, bread)).json()

    response = client.get(f"/lists/{lst['id']}/purchases/{ticket['id']}/items")

    assert response.status_code == 200
    lines = response.json()
    assert [line["name"] for line in lines] == ["Pan", "Leche"]
    for line in lines:
        assert line["purchase_id"] == ticket["id"]
        assert line["purchase_ends_at"] == ticket["closed_at"]


def test_an_open_carts_lines_are_readable_too(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    cart_id = _pid(session, milk)

    lines = client.get(f"/lists/{lst['id']}/purchases/{cart_id}/items").json()

    assert [line["name"] for line in lines] == ["Leche"]
    # An open cart's boundary is its tear-off, still ahead.
    ends_at = datetime.fromisoformat(lines[0]["purchase_ends_at"])
    assert ends_at > datetime.now(UTC).replace(tzinfo=None)


def test_another_lists_ticket_reads_as_not_found(
    client: TestClient, other_client: TestClient, session: Session
):
    """A purchase id is not proof of access to the trip it names."""
    mine = _create_list(client)
    theirs = other_client.post("/lists", json={"name": "Vecinos"}).json()
    their_bread = _tap(other_client, theirs["id"], "Pan")
    their_cart = _pid(session, their_bread)

    assert client.get(f"/lists/{mine['id']}/purchases/{their_cart}/items").status_code == 404
    assert client.get(f"/lists/{mine['id']}/purchases/no-such-trip/items").status_code == 404


def test_a_non_member_cannot_read_a_tickets_lines(
    client: TestClient, other_client: TestClient, session: Session
):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    cart_id = _pid(session, milk)

    response = other_client.get(f"/lists/{lst['id']}/purchases/{cart_id}/items")

    assert response.status_code == 403


# --- Re-buy: a settled line back onto the pending list ---


def _rebuy(client: TestClient, list_id: str, purchase_id: str, item_id: str):
    return client.post(f"/lists/{list_id}/purchases/{purchase_id}/items/{item_id}/rebuy")


def _pending(client: TestClient, list_id: str) -> list[dict]:
    return [i for i in client.get(f"/lists/{list_id}/items").json() if not i["purchased"]]


def test_rebuy_from_a_closed_trip_creates_a_fresh_pending_line(
    client: TestClient, session: Session
):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    ticket = _close(
        client,
        lst["id"],
        store="Lidl",
        lines=[{"item_id": milk["id"], "quantity": "2 L"}],
    ).json()

    response = _rebuy(client, lst["id"], ticket["id"], milk["id"])

    assert response.status_code == 201
    fresh = response.json()
    assert fresh["id"] != milk["id"]
    assert fresh["name"] == "Leche"
    assert fresh["purchased"] is False
    assert fresh["purchased_at"] is None
    assert fresh["purchase_id"] is None
    # The bought quantity becomes the new pending row's planned quantity.
    assert fresh["quantity"] == "2 L"
    # Bought at Lidl, so it goes back on the list tagged for Lidl.
    assert fresh["stores"] == ["Lidl"]
    # The source line stays filed on its ticket, untouched.
    assert _pid(session, milk) == ticket["id"]


def test_rebuy_from_the_open_cart_is_refused(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    cart_id = _pid(session, milk)

    response = _rebuy(client, lst["id"], cart_id, milk["id"])

    assert response.status_code == 409
    # Nothing new landed on the list.
    assert len(_pending(client, lst["id"])) == 0


def test_rebuy_of_an_item_not_on_that_purchase_is_not_found(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    bread = _tap(client, lst["id"], "Pan")
    milk_ticket = _close(client, lst["id"], store="Lidl", lines=_lines(milk)).json()
    bread_ticket = _close(client, lst["id"], store="Dia", lines=_lines(bread)).json()

    # Bread is a real line, but not of the milk's ticket.
    response = _rebuy(client, lst["id"], milk_ticket["id"], bread["id"])
    assert response.status_code == 404
    # And the bread ticket really does hold it — the 404 is about the pairing.
    assert _rebuy(client, lst["id"], bread_ticket["id"], bread["id"]).status_code == 201


def test_rebuy_with_an_unknown_purchase_is_not_found(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")

    response = _rebuy(client, lst["id"], "no-such-trip", milk["id"])

    assert response.status_code == 404


def test_rebuy_is_idempotent_against_the_pending_list(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    ticket = _close(client, lst["id"], store="Lidl", lines=_lines(milk)).json()

    first = _rebuy(client, lst["id"], ticket["id"], milk["id"])
    assert first.status_code == 201
    second = _rebuy(client, lst["id"], ticket["id"], milk["id"])

    # The product is already pending, so the second re-buy returns that row.
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    pending = _pending(client, lst["id"])
    assert len([i for i in pending if i["name"] == "Leche"]) == 1


def test_rebuy_prefers_the_lines_own_store_over_the_trips(client: TestClient, session: Session):
    lst = _create_list(client)
    # The line was priced at Dia; the trip as a whole is a Lidl shop.
    milk = _tap(client, lst["id"], "Leche")
    ticket = _close(
        client,
        lst["id"],
        store="Lidl",
        lines=[{"item_id": milk["id"], "price": 1.19}],
    ).json()
    # close() writes price_store from the close's store, so force a line store
    # that differs from the trip store to prove the precedence.
    row = session.get(ListItem, milk["id"])
    row.price_store = "Dia"
    session.add(row)
    session.commit()

    fresh = _rebuy(client, lst["id"], ticket["id"], milk["id"]).json()

    assert fresh["stores"] == ["Dia"]


def test_rebuy_falls_back_to_the_trip_store(client: TestClient, session: Session):
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    # No confirmed price, so the line carries no price_store; only the trip
    # knows where the shop was.
    ticket = _close(client, lst["id"], store="Mercadona", lines=_lines(milk)).json()
    assert session.get(ListItem, milk["id"]).price_store is None

    fresh = _rebuy(client, lst["id"], ticket["id"], milk["id"]).json()

    assert fresh["stores"] == ["Mercadona"]


def test_rebuy_notifies_on_create_but_not_on_the_idempotent_hit(client: TestClient):
    """A re-buy is an item creation, so it pushes like add_item — but only the
    genuine 201; the idempotent 200 changed nothing and must stay silent."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    ticket = _close(client, lst["id"], store="Lidl", lines=_lines(milk)).json()

    with patch("app.routers.purchases.notify_list_change") as notify:
        first = _rebuy(client, lst["id"], ticket["id"], milk["id"])
        assert first.status_code == 201
        notify.assert_called_once()

    with patch("app.routers.purchases.notify_list_change") as notify:
        second = _rebuy(client, lst["id"], ticket["id"], milk["id"])
        assert second.status_code == 200
        notify.assert_not_called()


# --- Manual purchases: a trip written down by hand, born closed, no lines ---


def _manual(client: TestClient, list_id: str, **body):
    if isinstance(body.get("date"), date):
        body["date"] = body["date"].isoformat()
    # Declare a timezone, as the real client and the sibling _close_dated helper
    # both do. Without it the endpoint judges the date in UTC, while these tests
    # build it from the machine's local `_client_today()` — so in the hours when the
    # local day is already ahead of UTC, today reads as the future and is refused.
    return client.post(
        f"/lists/{list_id}/purchases/manual",
        json=body,
        headers={"X-Client-Timezone": str(_MADRID)},
    )


def test_a_manual_purchase_is_born_closed_with_no_lines(client: TestClient, session: Session):
    lst = _create_list(client)

    response = _manual(client, lst["id"], store="Lidl", date=_client_today(), total=23.40)

    assert response.status_code == 200
    body = response.json()
    assert body["closed_at"] is not None
    assert body["store"] == "Lidl"
    assert body["total"] == 23.40
    trip = session.get(Purchase, body["id"])
    assert trip.list_id == lst["id"]
    lines = client.get(f"/lists/{lst['id']}/purchases/{body['id']}/items").json()
    assert lines == []
    page = _page(client, lst["id"]).json()
    (row,) = [p for p in page["purchases"] if p["id"] == body["id"]]
    assert row["line_count"] == 0


def test_a_back_dated_manual_purchase_files_under_its_day_not_now(
    client: TestClient, session: Session
):
    lst = _create_list(client)
    # A shop written down by hand a week after it happened.
    week_ago = _client_today() - timedelta(days=7)
    old = _manual(client, lst["id"], store="Lidl", date=week_ago, total=10.0).json()
    # A genuine, more recent trip closed just now.
    milk = _tap(client, lst["id"], "Leche")
    recent = _close(client, lst["id"], store="Mercadona", lines=_lines(milk)).json()

    body = _page(client, lst["id"]).json()

    ids = [p["id"] for p in body["purchases"]]
    # The back-dated entry did NOT jump to the top on "now": it sits under the
    # recent trip, filed by the boundary of the day it covered.
    assert ids.index(recent["id"]) < ids.index(old["id"])


def test_a_total_only_manual_save_works_with_no_store(client: TestClient, session: Session):
    lst = _create_list(client)

    response = _manual(client, lst["id"], date=_client_today(), total=8.75)

    assert response.status_code == 200
    body = response.json()
    assert body["store"] is None
    assert body["total"] == 8.75
    assert body["closed_at"] is not None


def test_a_manual_purchase_with_no_store_and_no_total_is_a_bare_record(
    client: TestClient, session: Session
):
    lst = _create_list(client)

    body = _manual(client, lst["id"], date=_client_today()).json()

    assert body["store"] is None
    assert body["total"] is None
    assert body["closed_at"] is not None


def test_a_manual_purchases_store_registers_in_the_registry(client: TestClient, session: Session):
    lst = _create_list(client)

    _manual(client, lst["id"], store="Carrefour", date=_client_today()).json()

    registered = session.exec(select(ListStore).where(ListStore.list_id == lst["id"])).all()
    assert [s.display_name for s in registered] == ["Carrefour"]


def test_a_manual_purchase_without_a_date_is_422(client: TestClient):
    lst = _create_list(client)

    response = client.post(f"/lists/{lst['id']}/purchases/manual", json={"store": "Lidl"})

    assert response.status_code == 422


def test_a_negative_manual_total_is_rejected(client: TestClient):
    lst = _create_list(client)

    response = _manual(client, lst["id"], date=_client_today(), total=-5.0)

    assert response.status_code == 422


def test_a_future_dated_manual_purchase_is_rejected(client: TestClient):
    """Back-dating only: a future date would sort above the live cart."""
    lst = _create_list(client)

    response = _manual(client, lst["id"], date=_client_today() + timedelta(days=1), total=5.0)

    assert response.status_code == 422


def test_a_manual_save_with_a_scan_id_links_the_scan(client: TestClient, session: Session, user):
    """The 18c rescue: an unreadable ticket's lineless scan hangs its stored
    capture on the record the user saves, so it shows paper from day one."""
    from app.db.models import ReceiptScan

    lst = _create_list(client)
    scan = ReceiptScan(list_id=lst["id"], scanned_by=user.id, parsed_lines=[])
    session.add(scan)
    session.commit()

    response = _manual(
        client, lst["id"], store="Lidl", date=_client_today(), total=23.40, scan_id=scan.id
    )

    assert response.status_code == 200
    session.expire_all()
    assert session.get(ReceiptScan, scan.id).purchase_id == response.json()["id"]
    (row,) = _page(client, lst["id"]).json()["purchases"]
    assert row["has_receipt"] is True


def test_a_manual_save_with_an_unknown_scan_id_is_404(client: TestClient, session: Session):
    lst = _create_list(client)

    response = _manual(client, lst["id"], date=_client_today(), scan_id="no-such-scan")

    assert response.status_code == 404
    # Nothing half-saved: the purchase was refused along with the link.
    assert session.exec(select(Purchase).where(Purchase.list_id == lst["id"])).all() == []


def test_a_manual_save_cannot_link_another_lists_scan(client: TestClient, session: Session, user):
    """A cross-list link would surface another household's paper through the
    per-trip scan read, which trusts purchase_id alone."""
    from app.db.models import ReceiptScan

    lst = _create_list(client)
    other = _create_list(client)
    scan = ReceiptScan(list_id=other["id"], scanned_by=user.id, parsed_lines=[])
    session.add(scan)
    session.commit()

    response = _manual(client, lst["id"], date=_client_today(), scan_id=scan.id)

    assert response.status_code == 404
    session.expire_all()
    assert session.get(ReceiptScan, scan.id).purchase_id is None


def test_a_blank_manual_store_reads_back_as_none(client: TestClient, session: Session):
    """An empty-string store is a bare record, not a store named ""."""
    lst = _create_list(client)

    body = _manual(client, lst["id"], store="   ", date=_client_today()).json()

    assert body["store"] is None
    registered = session.exec(select(ListStore).where(ListStore.list_id == lst["id"])).all()
    assert registered == []


def test_a_manual_purchases_boundary_lands_on_the_clients_day(client: TestClient, session: Session):
    from app.services.trips import tears_off_at_for

    lst = _create_list(client)
    tz = ZoneInfo("Europe/Madrid")
    day = date(2026, 7, 15)

    response = client.post(
        f"/lists/{lst['id']}/purchases/manual",
        json={"store": "Lidl", "date": day.isoformat()},
        headers={"X-Client-Timezone": "Europe/Madrid"},
    )

    assert response.status_code == 200
    trip = session.get(Purchase, response.json()["id"])
    # opened_at is the local midnight that STARTS the day, as naive UTC.
    expected_open = (
        datetime.combine(day, datetime.min.time(), tzinfo=tz).astimezone(UTC).replace(tzinfo=None)
    )
    assert trip.opened_at == expected_open
    assert trip.tears_off_at == tears_off_at_for(expected_open, tz)
    assert trip.closed_at == trip.tears_off_at


# --- Stack search (21b) --------------------------------------------------


def _search(client: TestClient, list_id: str, q: str):
    return client.get(f"/lists/{list_id}/purchases/search", params={"q": q})


def test_search_returns_only_matching_lines_with_the_trips_line_count(
    client: TestClient, session: Session
):
    """Each matched trip carries just its matching lines; line_count is M."""
    lst = _create_list(client)
    # A Mercadona trip with two lines, one of them a milk.
    milk = _tap(client, lst["id"], "Leche entera")
    bread = _tap(client, lst["id"], "Pan de molde")
    _close(client, lst["id"], store="Mercadona", total=8.13, lines=_lines(milk, bread))
    # A later Lidl trip with a single milk line.
    milk2 = _tap(client, lst["id"], "Leche sin lactosa")
    _close(client, lst["id"], store="Lidl", total=2.0, lines=_lines(milk2))

    results = _search(client, lst["id"], "leche").json()["results"]

    assert len(results) == 2
    by_store = {r["trip"]["store"]: r for r in results}
    merc = by_store["Mercadona"]
    assert [line["name"] for line in merc["lines"]] == ["Leche entera"]
    # M is the trip's whole line count, not the number matched.
    assert merc["trip"]["line_count"] == 2
    lidl = by_store["Lidl"]
    assert [line["name"] for line in lidl["lines"]] == ["Leche sin lactosa"]
    assert lidl["trip"]["line_count"] == 1


def test_search_is_newest_first(client: TestClient, session: Session):
    lst = _create_list(client)
    first = _tap(client, lst["id"], "Leche")
    _close(client, lst["id"], store="Mercadona", total=1.0, lines=_lines(first))
    second = _tap(client, lst["id"], "Leche")
    _close(client, lst["id"], store="Lidl", total=1.0, lines=_lines(second))

    results = _search(client, lst["id"], "leche").json()["results"]

    assert [r["trip"]["store"] for r in results] == ["Lidl", "Mercadona"]


def test_search_store_sigil_matches_by_key_and_is_strict(client: TestClient, session: Session):
    """@store keeps only that shop's trips, compared by key; others drop."""
    lst = _create_list(client)
    a = _tap(client, lst["id"], "Leche")
    _close(client, lst["id"], store="Mercadona", total=1.0, lines=_lines(a))
    b = _tap(client, lst["id"], "Leche")
    _close(client, lst["id"], store="Lidl", total=1.0, lines=_lines(b))

    # Lower-case, accent-insensitive: the key folds it onto "Mercadona".
    results = _search(client, lst["id"], "leche @mercadona").json()["results"]

    assert len(results) == 1
    assert results[0]["trip"]["store"] == "Mercadona"


def test_search_store_sigil_drops_a_store_less_proto(client: TestClient, session: Session):
    """A torn-off proto with no shop cannot match an @store query."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    # Backdate its trip so it has torn off but stayed unclosed — a proto, store
    # None. Searching by name alone finds it; searching @mercadona must not.
    _tear_off(session, milk, days_ago=2)

    assert len(_search(client, lst["id"], "leche").json()["results"]) == 1
    assert _search(client, lst["id"], "leche @mercadona").json()["results"] == []


def test_search_excludes_the_open_cart_and_unmatched_trips(client: TestClient, session: Session):
    """The live cart is not history, and a trip with no match does not appear."""
    lst = _create_list(client)
    # Leche stays in the open cart; Pan is split off into its own closed trip.
    _tap(client, lst["id"], "Leche fresca")
    pan = _tap(client, lst["id"], "Pan")
    _close(client, lst["id"], store="Lidl", total=1.0, lines=_lines(pan))

    # The open cart's leche is not history, and the Lidl trip has no leche.
    assert _search(client, lst["id"], "leche").json()["results"] == []


def test_search_lines_carry_the_purchase_boundary(client: TestClient, session: Session):
    """Matched lines expose purchase_ends_at, so the client mirrors the guard."""
    lst = _create_list(client)
    milk = _tap(client, lst["id"], "Leche")
    _close(client, lst["id"], store="Mercadona", total=1.0, lines=_lines(milk))

    line = _search(client, lst["id"], "leche").json()["results"][0]["lines"][0]

    assert line["purchase_ends_at"] is not None
    assert line["purchased"] is True
