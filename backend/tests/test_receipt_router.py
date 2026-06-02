import pytest
from datetime import datetime

from app.db.models import List, ListItem, ListMember
from app.db.models import UserFeature as _UserFeature


LIST_ID = "list-receipt-test"


@pytest.fixture(autouse=True)
def enable_receipt_flag(session, user):
    """Enable ai_receipt_scanning for the test user so existing tests keep passing."""
    row = _UserFeature(
        user_id=user.id,
        feature="ai_receipt_scanning",
        enabled=True,
        granted_by="admin",
    )
    session.add(row)
    session.commit()


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


def test_post_receipt_returns_kilogram_price_type(client, session):
    item = ListItem(
        id="item-bacon",
        list_id=LIST_ID,
        name="Bacon lonchas",
        added_by=session.get(ListItem, "item-almendras").added_by,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),
    )
    session.add(item)
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={
            "store": "Mercadona",
            "receipt_date": "2026-04-11",
            "receipt_total": 2.30,
            "lines": [
                {
                    "name": "BACON LONCHAS",
                    "price_type": "KILOGRAM",
                    "unit_price": 11.40,
                    "quantity": 0.202,
                    "line_total": 2.30,
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    matched = body["matched"]
    assert len(matched) == 1
    assert matched[0]["price_type"] == "KILOGRAM"
    assert matched[0]["unit_price"] == pytest.approx(11.40)
    assert matched[0]["quantity"] == pytest.approx(0.202)
    assert matched[0]["line_total"] == pytest.approx(2.30)


def test_post_receipt_infers_store_when_one_item_has_no_store(client, session):
    """Store is inferred when matched items have a mix of null and non-null price_store,
    as long as all non-null values agree."""
    item2 = ListItem(
        id="item-leche",
        list_id=LIST_ID,
        name="Leche entera",
        added_by=session.get(ListItem, "item-almendras").added_by,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),
        price_store=None,
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
                {"name": "LECHE ENTERA", "price_type": "UNIT", "unit_price": 0.89, "quantity": None, "line_total": 0.89},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["store"] == "Mercadona"


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


def test_receipt_prices_updates_quantity(client, session):
    """patch.quantity now goes to purchased_quantity, not quantity."""
    body = {
        "scan_id": None,
        "patches": [
            {
                "item_id": "item-almendras",
                "price": 1.15,
                "price_per": None,
                "store": "Mercadona",
                "quantity": "2",
            }
        ],
        "mappings": [],
    }
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 200
    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.purchased_quantity == "2"
    assert item.quantity is None   # was never set on this item in seed


def test_receipt_prices_preserves_quantity_when_null(client, session):
    """When patch.quantity is None, quantity (planned) is left untouched."""
    item = session.get(ListItem, "item-almendras")
    item.quantity = "500g"
    session.add(item)
    session.commit()

    body = {
        "scan_id": None,
        "patches": [
            {
                "item_id": "item-almendras",
                "price": 1.15,
                "price_per": None,
                "store": "Mercadona",
                "quantity": None,
            }
        ],
        "mappings": [],
    }
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 200
    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.quantity == "500g"            # planning qty untouched
    assert item.purchased_quantity is None    # no receipt qty provided


def test_receipt_prices_writes_purchased_quantity_not_quantity(client, session):
    """patch.quantity should go to purchased_quantity, leaving quantity unchanged."""
    item = session.get(ListItem, "item-almendras")
    item.quantity = "2"  # planned qty — must survive the receipt apply
    session.add(item)
    session.commit()

    body = {
        "scan_id": None,
        "patches": [
            {
                "item_id": "item-almendras",
                "price": 1.15,
                "price_per": None,
                "store": "Mercadona",
                "quantity": "487g",  # actual qty from receipt
            }
        ],
        "mappings": [],
    }
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 200
    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.purchased_quantity == "487g"   # written to new field
    assert item.quantity == "2"                # planning qty preserved


def test_receipt_prices_purchased_quantity_null_when_patch_quantity_null(client, session):
    """When patch.quantity is None, purchased_quantity should not be set."""
    body = {
        "scan_id": None,
        "patches": [
            {
                "item_id": "item-almendras",
                "price": 1.15,
                "price_per": None,
                "store": "Mercadona",
                "quantity": None,
            }
        ],
        "mappings": [],
    }
    client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    session.expire_all()
    assert session.get(ListItem, "item-almendras").purchased_quantity is None


def test_post_receipt_returns_403_when_flag_disabled(session, other_user, other_client):
    from app.db.models import List, ListMember

    lst = List(id="list-receipt-other", name="Other List", owner_id=other_user.id)
    mem = ListMember(list_id="list-receipt-other", user_id=other_user.id)
    session.add_all([lst, mem])
    session.commit()

    response = other_client.post("/lists/list-receipt-other/receipt", json=_unit_body())
    assert response.status_code == 403
