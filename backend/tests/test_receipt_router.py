from datetime import datetime

import pytest
from sqlmodel import select

from app.db.models import List, ListItem, ListMember
from app.db.models import UserFeature as _UserFeature
from app.routers.receipt import _parse_receipt_at
from app.schemas.receipt import ReceiptPriceBatch

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
                {
                    "name": "BEBIDA ALMENDRAS 0%",
                    "price_type": "UNIT",
                    "unit_price": 1.15,
                    "quantity": None,
                    "line_total": 1.15,
                },
                {
                    "name": "BACON LONCHAS",
                    "price_type": "UNIT",
                    "unit_price": 2.30,
                    "quantity": None,
                    "line_total": 2.30,
                },
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
                {
                    "name": "BEBIDA ALMENDRAS 0%",
                    "price_type": "UNIT",
                    "unit_price": 1.15,
                    "quantity": None,
                    "line_total": 1.15,
                },
                {
                    "name": "LECHE ENTERA",
                    "price_type": "UNIT",
                    "unit_price": 0.89,
                    "quantity": None,
                    "line_total": 0.89,
                },
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
                {
                    "item_id": "item-almendras",
                    "price": 1.15,
                    "price_per": None,
                    "store": "Mercadona",
                }
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
    assert item.quantity is None  # was never set on this item in seed


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
    assert item.quantity == "500g"  # planning qty untouched
    assert item.purchased_quantity is None  # no receipt qty provided


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
    assert item.purchased_quantity == "487g"  # written to new field
    assert item.quantity == "2"  # planning qty preserved


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


def test_post_receipt_matches_most_recently_purchased_duplicate(client, session):
    """Re-buying an item creates a second row with the same name; the scan
    must match the recent purchase, not an older one. Both purchases are kept
    inside the +-3 day match window so this exercises match_lines' recency
    preference, not the window filter itself."""
    old_item = session.get(ListItem, "item-almendras")
    old_item.name = "Leche entera"
    old_item.purchased_at = datetime(2026, 4, 9, 9, 0, 0)
    session.add(old_item)

    recent_item = ListItem(
        id="item-leche-recent",
        list_id=LIST_ID,
        name="Leche entera",
        added_by=old_item.added_by,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),
    )
    session.add(recent_item)
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={
            "store": "Mercadona",
            "receipt_date": "2026-04-11",
            "receipt_total": 0.89,
            "lines": [
                {
                    "name": "LECHE ENTERA",
                    "price_type": "UNIT",
                    "unit_price": 0.89,
                    "quantity": None,
                    "line_total": 0.89,
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-leche-recent"


def test_post_receipt_prefers_purchase_closest_to_receipt_date_over_more_recent_one(
    client, session
):
    """Scanning an older receipt after already buying the same item again more
    recently must still match the purchase closest to the receipt date, not
    the newer unrelated purchase."""
    close_item = session.get(ListItem, "item-almendras")
    close_item.name = "Leche entera"
    close_item.purchased_at = datetime(2026, 4, 9, 9, 0, 0)  # same day as receipt
    session.add(close_item)

    newer_item = ListItem(
        id="item-leche-newer",
        list_id=LIST_ID,
        name="Leche entera",
        added_by=close_item.added_by,
        purchased_at=datetime(2026, 4, 11, 15, 57, 0),  # 2 days after receipt, more recent
    )
    session.add(newer_item)
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={
            "store": "Mercadona",
            "receipt_date": "2026-04-09",
            "receipt_total": 0.89,
            "lines": [
                {
                    "name": "LECHE ENTERA",
                    "price_type": "UNIT",
                    "unit_price": 0.89,
                    "quantity": None,
                    "line_total": 0.89,
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-almendras"


def test_post_receipt_ignores_items_purchased_outside_match_window(client, session):
    """Items purchased more than 3 days from the receipt date are excluded
    from the candidate pool entirely, so an unrelated old purchase can't be
    fuzzy-matched even when no closer candidate exists."""
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 3, 1, 9, 0, 0)  # 41 days before receipt
    session.add(item)
    session.commit()

    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 0
    assert len(body["unmatched"]) == 1


def test_post_receipt_includes_items_purchased_within_window_after_receipt_date(client, session):
    """Items marked purchased a few days after the printed receipt date
    (e.g. the user scans late) are still matchable."""
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 4, 14, 9, 0, 0)  # 3 days after receipt_date
    session.add(item)
    session.commit()

    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-almendras"


def test_post_receipt_returns_403_when_flag_disabled(session, other_user, other_client):
    from app.db.models import List, ListMember

    lst = List(id="list-receipt-other", name="Other List", owner_id=other_user.id)
    mem = ListMember(list_id="list-receipt-other", user_id=other_user.id)
    session.add_all([lst, mem])
    session.commit()

    response = other_client.post("/lists/list-receipt-other/receipt", json=_unit_body())
    assert response.status_code == 403


def test_receipt_prices_is_backward_compatible_with_pre_new_items_clients(client, session):
    """A cached PWA client deployed before this change omits new_items and
    receipt_date. The endpoint must still succeed and must not create anything."""
    before = len(session.exec(select(ListItem).where(ListItem.list_id == LIST_ID)).all())

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={"scan_id": None, "patches": [], "mappings": []},
    )

    assert response.status_code == 200
    after = len(session.exec(select(ListItem).where(ListItem.list_id == LIST_ID)).all())
    assert after == before


def test_receipt_price_batch_parses_new_items_and_receipt_date():
    """Guards the schema itself: the endpoint tolerates unknown keys either way,
    so only direct model validation distinguishes parsed from silently dropped."""
    batch = ReceiptPriceBatch.model_validate(
        {
            "scan_id": None,
            "receipt_date": "2026-04-11",
            "patches": [],
            "new_items": [
                {
                    "name": "Chocolate negro",
                    "brand": "Valor",
                    "ean": None,
                    "price": 1.8,
                    "price_per": None,
                    "store": "Mercadona",
                    "quantity": "1",
                }
            ],
            "mappings": [],
        }
    )

    assert batch.receipt_date == "2026-04-11"
    assert len(batch.new_items) == 1
    assert batch.new_items[0].name == "Chocolate negro"
    assert batch.new_items[0].brand == "Valor"
    assert batch.new_items[0].price == 1.8
    assert batch.new_items[0].store == "Mercadona"
    assert batch.new_items[0].quantity == "1"
    assert batch.new_items[0].ean is None


def test_receipt_price_batch_defaults_new_fields():
    """An older cached client omits both new fields entirely."""
    batch = ReceiptPriceBatch.model_validate({"scan_id": None})
    assert batch.receipt_date is None
    assert batch.new_items == []
    assert batch.patches == []
    assert batch.mappings == []


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-04-11", datetime(2026, 4, 11, 0, 0)),
        ("2026-04-11T17:42:00Z", datetime(2026, 4, 11, 17, 42)),
        ("2026-04-11T17:42:00+02:00", datetime(2026, 4, 11, 15, 42)),
        (None, None),
        ("", None),
        ("not-a-date", None),
    ],
)
def test_parse_receipt_at(raw, expected):
    assert _parse_receipt_at(raw) == expected


def test_parse_receipt_at_returns_naive_datetimes():
    """Stored timestamps are naive UTC throughout the codebase."""
    assert _parse_receipt_at("2026-04-11T17:42:00Z").tzinfo is None


def test_receipt_prices_marks_unpurchased_item_as_purchased(client, session, user):
    session.add(
        ListItem(
            id="item-pan",
            list_id=LIST_ID,
            name="Pan de molde",
            added_by=user.id,
            purchased_at=None,
        )
    )
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": None,
            "receipt_date": "2026-04-11T17:42:00Z",
            "patches": [
                {
                    "item_id": "item-pan",
                    "price": 1.25,
                    "price_per": None,
                    "store": "Mercadona",
                    "quantity": "1",
                }
            ],
            "new_items": [],
            "mappings": [],
        },
    )
    assert response.status_code == 200

    session.expire_all()
    item = session.get(ListItem, "item-pan")
    assert item.purchased_at == datetime(2026, 4, 11, 17, 42)
    assert item.price == pytest.approx(1.25)


def test_receipt_prices_does_not_rewrite_an_existing_purchase_timestamp(client, session):
    """A co-shopper may have purchased it days ago; only prices should change."""
    original = session.get(ListItem, "item-almendras").purchased_at

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": None,
            "receipt_date": "2026-04-11T17:42:00Z",
            "patches": [
                {
                    "item_id": "item-almendras",
                    "price": 1.15,
                    "price_per": None,
                    "store": "Mercadona",
                    "quantity": None,
                }
            ],
            "new_items": [],
            "mappings": [],
        },
    )
    assert response.status_code == 200

    session.expire_all()
    assert session.get(ListItem, "item-almendras").purchased_at == original
