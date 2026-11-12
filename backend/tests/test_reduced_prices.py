"""A price read from a reduced label, and the old price copied next to it
(JAV-221): stored beside the price paid, never in its place."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ListItem


def _list(client: TestClient) -> str:
    return client.post("/lists", json={"name": "Casa"}).json()["id"]


def _tap(client: TestClient, list_id: str, name: str) -> dict:
    item = client.post(f"/lists/{list_id}/items", json={"name": name}).json()
    return client.patch(f"/lists/{list_id}/items/{item['id']}", json={"purchased": True}).json()


def _close(client: TestClient, list_id: str, *lines: dict, new_items=()):
    return client.post(
        f"/lists/{list_id}/purchases/close",
        json={"store": "Mercadona", "lines": list(lines), "new_items": list(new_items)},
    )


def _row(session: Session, item_id: str) -> ListItem:
    row = session.get_one(ListItem, item_id)
    session.refresh(row)
    return row


def _weighed(item: dict, **fields) -> dict:
    # Contramuslo from the approved frames: 0,346 kg at 8,82 €/kg, 12,60 €/kg before.
    return {
        "item_id": item["id"],
        "price": 8.82,
        "price_per": "KILOGRAM",
        "quantity": "0,346 kg",
        **fields,
    }


def test_a_close_keeps_the_price_paid_and_stores_the_old_one_beside_it(
    client: TestClient, session: Session
):
    list_id = _list(client)
    item = _tap(client, list_id, "Contramuslo")

    response = _close(client, list_id, _weighed(item, reduced=True, price_before=12.60))

    assert response.status_code == 200
    row = _row(session, item["id"])
    assert (row.price, row.price_reduced, row.price_before) == (8.82, True, 12.60)
    [read] = [i for i in client.get(f"/lists/{list_id}/items").json() if i["id"] == item["id"]]
    assert read["price"] == 8.82 and read["price_before"] == 12.60
    # Whether a price was reduced stays off the item: only a known old price shows.
    assert "price_reduced" not in read and "reduced" not in read


def test_a_reduced_price_with_no_old_price_is_still_marked(client: TestClient, session: Session):
    list_id = _list(client)
    item = _tap(client, list_id, "Pechuga")

    assert _close(client, list_id, _weighed(item, reduced=True)).status_code == 200

    row = _row(session, item["id"])
    assert (row.price_reduced, row.price_before) == (True, None)


def test_the_price_history_says_which_prices_were_reduced(client: TestClient, session: Session):
    list_id = _list(client)
    item = _tap(client, list_id, "Contramuslo")
    _close(client, list_id, _weighed(item, reduced=True, price_before=12.60))

    history = client.get(f"/lists/{list_id}/items/{item['id']}/prices").json()["entries"]

    assert [(e["amount"], e["reduced"], e["price_before"]) for e in history] == [
        (8.82, True, 12.60)
    ]


def test_an_impulse_buy_can_carry_a_reduced_price(client: TestClient, session: Session):
    list_id = _list(client)
    milk = _tap(client, list_id, "Leche")
    new = {"name": "Filete", "price": 14.40, "price_per": "KILOGRAM", "quantity": "0,522 kg"}

    response = _close(
        client,
        list_id,
        {"item_id": milk["id"]},
        new_items=[{**new, "reduced": True, "price_before": 18.00}],
    )

    assert response.status_code == 200
    [row] = session.exec(select(ListItem).where(ListItem.name == "Filete")).all()
    assert (row.price, row.price_reduced, row.price_before) == (14.40, True, 18.00)


def test_an_old_price_no_higher_than_the_price_paid_is_refused(
    client: TestClient, session: Session
):
    list_id = _list(client)
    item = _tap(client, list_id, "Contramuslo")

    response = _close(client, list_id, _weighed(item, reduced=True, price_before=8.00))

    assert response.status_code == 422
    assert response.json()["detail"] == "lines[0].price_before must be higher than lines[0].price"
    # Checked before anything is written.
    assert _row(session, item["id"]).price is None


def test_an_old_price_needs_a_reduced_price(client: TestClient):
    list_id = _list(client)
    item = _tap(client, list_id, "Contramuslo")

    response = _close(client, list_id, _weighed(item, price_before=12.60))

    assert response.status_code == 422
    assert "requires a reduced" in response.json()["detail"]


def test_a_line_closed_without_a_price_drops_what_a_label_said(
    client: TestClient, session: Session
):
    list_id = _list(client)
    item = _tap(client, list_id, "Contramuslo")
    row = _row(session, item["id"])
    row.price, row.price_reduced, row.price_before = 8.82, True, 12.60
    session.add(row)
    session.commit()

    assert _close(client, list_id, {"item_id": item["id"]}).status_code == 200

    row = _row(session, item["id"])
    assert (row.price, row.price_reduced, row.price_before) == (None, False, None)


def test_a_price_typed_by_hand_is_not_the_labels(client: TestClient, session: Session):
    list_id = _list(client)
    item = _tap(client, list_id, "Contramuslo")
    _close(client, list_id, _weighed(item, reduced=True, price_before=12.60))

    response = client.patch(
        f"/lists/{list_id}/items/{item['id']}/prices",
        json={"amount": 9.50, "price_per": "KILOGRAM", "store": "Mercadona"},
    )

    assert response.status_code == 200
    row = _row(session, item["id"])
    assert (row.price, row.price_reduced, row.price_before) == (9.50, False, None)
