import pytest
from datetime import datetime

from app.db.models import List, ListItem, ListMember


LIST_ID = "list-receipt-test"


@pytest.fixture(autouse=True)
def seed_list(session, user):
    lst = List(id=LIST_ID, name="Test List", owner_id=user.id)
    member = ListMember(list_id=LIST_ID, user_id=user.id)
    item = ListItem(
        id="item-almendras",
        list_id=LIST_ID,
        name="Bebida de almendra 0% azúcares",
        added_by=user.id,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),
    )
    session.add_all([lst, member, item])
    session.commit()


def _unit_body(store="Mercadona"):
    return {
        "store": store,
        "receipt_date": "2026-04-11",
        "receipt_total": 1.15,
        "lines": [
            {
                "name": "BEBIDA ALMENDRAS 0%",
                "price_type": "UNIT",
                "unit_price": 1.15,
                "quantity": None,
                "line_total": 1.15,
            }
        ],
    }


def test_post_receipt_returns_scan_result(client):
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200
    body = response.json()
    assert "scan_id" in body
    assert body["store"] == "Mercadona"
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-almendras"
    assert body["matched"][0]["unit_price"] == pytest.approx(1.15)
    assert body["matched"][0]["price_type"] == "UNIT"


def test_post_receipt_infers_store_when_null(client, session):
    item = session.get(ListItem, "item-almendras")
    item.price_store = "Mercadona"
    session.add(item)
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={**_unit_body(), "store": None},
    )
    assert response.status_code == 200
    assert response.json()["store"] == "Mercadona"


def test_post_receipt_store_stays_null_when_items_have_mixed_stores(client, session):
    item2 = ListItem(
        id="item-bacon",
        list_id=LIST_ID,
        name="Bacon lonchas",
        added_by=session.get(ListItem, "item-almendras").added_by,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),
        price_store="Lidl",
    )
    item = session.get(ListItem, "item-almendras")
    item.price_store = "Mercadona"
    session.add_all([item, item2])
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={
            "store": None,
            "receipt_date": None,
            "receipt_total": None,
            "lines": [
                {"name": "BEBIDA ALMENDRAS 0%", "price_type": "UNIT", "unit_price": 1.15, "quantity": None, "line_total": 1.15},
                {"name": "BACON LONCHAS", "price_type": "UNIT", "unit_price": 2.30, "quantity": None, "line_total": 2.30},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["store"] is None


def test_post_receipt_prices_writes_unit_price(client, session):
    scan_resp = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    scan_id = scan_resp.json()["scan_id"]

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": "item-almendras", "price": 1.15, "price_per": None, "store": "Mercadona"}
            ],
            "mappings": [
                {
                    "store": "Mercadona",
                    "receipt_name": "bebida almendras 0%",
                    "item_name": "Bebida de almendra 0% azúcares",
                    "item_brand": None,
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["items_updated"] == 1

    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.price == pytest.approx(1.15)
    assert item.price_store == "Mercadona"
