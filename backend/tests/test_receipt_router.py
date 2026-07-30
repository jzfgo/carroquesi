from datetime import UTC, date, datetime, timedelta

import pytest
from sqlmodel import select

from app.db.models import List, ListItem, ListMember, Purchase, ReceiptScan
from app.db.models import UserFeature as _UserFeature
from app.routers.receipt import _parse_receipt_at, _receipt_day
from app.schemas.receipt import ReceiptPriceBatch
from app.services import trips

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


def test_post_receipt_centres_the_window_on_the_shoppers_day_not_the_utc_one(client, session):
    """A receipt printed just after local midnight east of Greenwich falls on
    the previous UTC day, and centring the window there spends a day of the
    tolerance the window exists for.

    The item below is marked purchased 3 days after the printed date -- inside
    +-3, and the exact case
    test_post_receipt_includes_items_purchased_within_window_after_receipt_date
    covers for a bare date. Read as UTC the receipt lands on the 10th, the
    window ends at the 14th 00:00, and this item falls out of it: the shopper
    silently gets [-4, +2] instead of [-3, +3].
    """
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 4, 14, 9, 0, 0)
    session.add(item)
    session.commit()

    body = _unit_body()
    # 00:30 on the 11th in Madrid == 22:30 on the 10th in UTC.
    body["receipt_date"] = "2026-04-11T00:30:00+02:00"

    response = client.post(f"/lists/{LIST_ID}/receipt", json=body)
    assert response.status_code == 200
    assert len(response.json()["matched"]) == 1


def test_post_receipt_stores_the_instant_even_when_the_day_is_local(client, session):
    """The day moved; the stored timestamp did not. `receipt_at` is a naive UTC
    column, so an offset-bearing date must still be normalised into it."""
    body = _unit_body()
    body["receipt_date"] = "2026-04-11T00:30:00+02:00"

    client.post(f"/lists/{LIST_ID}/receipt", json=body)

    scan = session.exec(select(ReceiptScan)).one()
    assert scan.receipt_at == datetime(2026, 4, 10, 22, 30)


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Written with an offset: the day is the shopper's, not UTC's.
        ("2026-04-11T00:30:00+02:00", date(2026, 4, 11)),
        ("2026-04-10T23:30:00-02:00", date(2026, 4, 10)),
        # Without one there is only one day on offer, so nothing changes for
        # bare dates, older clients sending 'Z', or scans already stored.
        ("2026-04-11", date(2026, 4, 11)),
        ("2026-04-11T17:42:00Z", date(2026, 4, 11)),
        (None, None),
        ("", None),
        ("not-a-date", None),
    ],
)
def test_receipt_day(raw, expected):
    assert _receipt_day(raw) == expected


def test_post_receipt_returns_403_when_flag_disabled(session, other_user, other_client):
    from app.db.models import List, ListMember

    lst = List(id="list-receipt-other", name="Other List", owner_id=other_user.id)
    mem = ListMember(list_id="list-receipt-other", user_id=other_user.id)
    session.add_all([lst, mem])
    session.commit()

    response = other_client.post("/lists/list-receipt-other/receipt", json=_unit_body())
    assert response.status_code == 403


def test_receipt_prices_returns_403_when_flag_disabled(session, other_user, other_client):
    """The apply step must gate on ai_receipt_scanning too, not just the scan
    step. other_user is a member of their own list but lacks the flag, so a
    direct call to /receipt-prices (bypassing the UI's scan-first flow) must be
    rejected before it can write prices or create impulse buys."""
    from app.db.models import List, ListMember

    lst = List(id="list-receipt-other", name="Other List", owner_id=other_user.id)
    mem = ListMember(list_id="list-receipt-other", user_id=other_user.id)
    session.add_all([lst, mem])
    session.commit()

    response = other_client.post(
        "/lists/list-receipt-other/receipt-prices",
        json={"scan_id": None, "patches": [], "mappings": []},
    )
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


def test_receipt_prices_falls_back_to_now_without_a_receipt_date(client, session, user):
    """Older clients omit receipt_date; the purchase still gets a timestamp."""
    session.add(
        ListItem(
            id="item-leche",
            list_id=LIST_ID,
            name="Leche",
            added_by=user.id,
            purchased_at=None,
        )
    )
    session.commit()
    before = datetime.now(UTC).replace(tzinfo=None)

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": None,
            "patches": [
                {
                    "item_id": "item-leche",
                    "price": 0.99,
                    "price_per": None,
                    "store": "Mercadona",
                    "quantity": None,
                }
            ],
            "mappings": [],
        },
    )
    assert response.status_code == 200

    session.expire_all()
    item = session.get(ListItem, "item-leche")
    assert item.purchased_at is not None
    assert item.purchased_at >= before


def _new_item_body(**overrides):
    item = {
        "name": "Chocolate negro 85%",
        "brand": "Valor",
        "ean": "8412345678901",
        "price": 1.8,
        "price_per": None,
        "store": "Mercadona",
        "quantity": "2",
    }
    item.update(overrides)
    return {
        "scan_id": None,
        "receipt_date": "2026-04-11T17:42:00Z",
        "patches": [],
        "new_items": [item],
        "mappings": [],
    }


def test_receipt_prices_creates_a_purchased_item(client, session, user):
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=_new_item_body())
    assert response.status_code == 200
    assert response.json()["items_created"] == 1

    created = session.exec(select(ListItem).where(ListItem.name == "Chocolate negro 85%")).one()
    assert created.list_id == LIST_ID
    assert created.added_by == user.id
    assert created.brand == "Valor"
    assert created.ean == "8412345678901"
    assert created.price == pytest.approx(1.8)
    assert created.price_store == "Mercadona"
    assert created.stores == ["Mercadona"]
    assert created.purchased_at == datetime(2026, 4, 11, 17, 42)


def test_created_item_uses_purchased_quantity_not_planned_quantity(client, session):
    client.post(f"/lists/{LIST_ID}/receipt-prices", json=_new_item_body())
    created = session.exec(select(ListItem).where(ListItem.name == "Chocolate negro 85%")).one()
    assert created.purchased_quantity == "2"
    assert created.quantity is None


def test_created_item_falls_back_to_now_without_a_receipt_date(client, session):
    before = datetime.now(UTC).replace(tzinfo=None)
    body = _new_item_body()
    body["receipt_date"] = None
    client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)

    created = session.exec(select(ListItem).where(ListItem.name == "Chocolate negro 85%")).one()
    assert created.purchased_at >= before


def test_created_item_has_empty_stores_without_a_store(client, session):
    client.post(f"/lists/{LIST_ID}/receipt-prices", json=_new_item_body(store=None))
    created = session.exec(select(ListItem).where(ListItem.name == "Chocolate negro 85%")).one()
    assert created.stores == []
    assert created.price_store is None


def test_receipt_prices_clamps_a_future_receipt_date(client, session, user):
    """A receipt date misread by OCR (a stray year digit, DD/MM vs MM/DD) must
    not open a second trip in the future alongside the live cart -- the same
    reason items.py's own tap clamps a future instant to `now`. Unclamped, the
    unrelated future-dated trip and the still-open live cart both satisfy
    "unreconciled and not yet torn off", and open_trip()'s unordered `.first()`
    then picks between them arbitrarily.
    """
    now = datetime.now(UTC).replace(tzinfo=None)
    live_cart_item = ListItem(id="item-hoy", list_id=LIST_ID, name="Pan", added_by=user.id)
    session.add(live_cart_item)
    session.commit()
    trips.attach(session, live_cart_item, now)
    session.commit()

    session.add(ListItem(id="item-leche-future", list_id=LIST_ID, name="Leche", added_by=user.id))
    session.commit()

    far_future = (datetime.now(UTC) + timedelta(days=400)).isoformat()
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": None,
            "receipt_date": far_future,
            "patches": [
                {
                    "item_id": "item-leche-future",
                    "price": 0.99,
                    "price_per": None,
                    "store": "Mercadona",
                    "quantity": None,
                }
            ],
            "mappings": [],
        },
    )
    assert response.status_code == 200

    session.expire_all()
    now = datetime.now(UTC).replace(tzinfo=None)
    open_trips = [
        t
        for t in session.exec(select(Purchase).where(Purchase.list_id == LIST_ID)).all()
        if trips.is_open(t, now)
    ]
    assert len(open_trips) == 1

    future_item = session.get(ListItem, "item-leche-future")
    assert future_item.purchase_id == open_trips[0].id
    assert future_item.purchased_at <= now


def test_receipt_prices_reports_updated_and_created_counts(client, session, user):
    session.add(ListItem(id="item-pan2", list_id=LIST_ID, name="Pan", added_by=user.id))
    session.commit()

    body = _new_item_body()
    body["patches"] = [
        {
            "item_id": "item-pan2",
            "price": 1.25,
            "price_per": None,
            "store": "Mercadona",
            "quantity": "1",
        }
    ]
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.json() == {"items_updated": 1, "items_created": 1}


def test_new_item_rejects_an_empty_name(client):
    body = _new_item_body(name="")
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 422


def test_new_item_rejects_an_unknown_price_per(client):
    body = _new_item_body(price_per="LITRE")
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 422


def test_scan_audit_counts_created_and_updated_items(client, session, user):
    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id)
    session.add(scan)
    session.add(ListItem(id="item-pan3", list_id=LIST_ID, name="Pan", added_by=user.id))
    session.commit()
    scan_id = scan.id

    body = _new_item_body()
    body["scan_id"] = scan_id
    body["patches"] = [
        {
            "item_id": "item-pan3",
            "price": 1.25,
            "price_per": None,
            "store": "Mercadona",
            "quantity": "1",
        }
    ]
    client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)

    session.expire_all()
    assert session.get(ReceiptScan, scan_id).items_updated == 2


def test_post_receipt_matches_when_the_date_is_a_full_instant(client):
    """An instant must not fall through the ValueError handler and disable the
    match window."""
    body = _unit_body()
    body["receipt_date"] = "2026-04-11T17:42:00Z"
    response = client.post(f"/lists/{LIST_ID}/receipt", json=body)

    assert response.status_code == 200
    assert len(response.json()["matched"]) == 1


def test_post_receipt_still_matches_with_a_bare_date(client):
    """Cached older clients keep sending YYYY-MM-DD."""
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert len(response.json()["matched"]) == 1


def test_post_receipt_full_instant_excludes_items_outside_match_window(client, session):
    """Discriminating case for the two tests above: a full ISO instant must
    still enforce the +-3 day match window, not silently disable it.

    Without the fix, `date.fromisoformat` raises on the "T...Z" suffix, the
    bare `except ValueError: pass` swallows it, `receipt_date` stays None,
    and the window filter is skipped entirely -- so this item (purchased 41
    days before the receipt) would still be an eligible fuzzy-match
    candidate and this test would fail with `matched` non-empty. Mirrors
    test_post_receipt_ignores_items_purchased_outside_match_window, but sent
    as an instant instead of a bare date so it actually exercises the parser
    used by the bug fix.
    """
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 3, 1, 9, 0, 0)  # 41 days before receipt
    session.add(item)
    session.commit()

    body = _unit_body()
    body["receipt_date"] = "2026-04-11T17:42:00Z"
    response = client.post(f"/lists/{LIST_ID}/receipt", json=body)

    assert response.status_code == 200
    result = response.json()
    assert len(result["matched"]) == 0
    assert len(result["unmatched"]) == 1


def test_scan_record_keeps_the_receipt_time(client, session):
    body = _unit_body()
    body["receipt_date"] = "2026-04-11T17:42:00Z"
    scan_id = client.post(f"/lists/{LIST_ID}/receipt", json=body).json()["scan_id"]

    scan = session.get(ReceiptScan, scan_id)
    assert scan.receipt_at == datetime(2026, 4, 11, 17, 42)


def test_scan_record_stores_midnight_for_a_bare_date(client, session):
    scan_id = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body()).json()["scan_id"]
    scan = session.get(ReceiptScan, scan_id)
    assert scan.receipt_at == datetime(2026, 4, 11, 0, 0)


# --- Task 10: a receipt scan reconciles a trip ------------------------------


def test_reconciling_cart_items_splits_a_closed_trip_leaving_unmatched_open(client, session, user):
    """The Lidl/Mercadona evening, but arriving via a receipt scan instead of
    the manual close endpoint: two of three cart items are named on the
    receipt, so they must be carved into a closed trip while the third stays
    in the still-open cart."""
    now = datetime.now(UTC).replace(tzinfo=None)
    item_a = ListItem(
        id="item-a", list_id=LIST_ID, name="Item A", added_by=user.id, purchased_at=None
    )
    item_b = ListItem(
        id="item-b", list_id=LIST_ID, name="Item B", added_by=user.id, purchased_at=None
    )
    item_c = ListItem(
        id="item-c", list_id=LIST_ID, name="Item C", added_by=user.id, purchased_at=now
    )
    session.add_all([item_a, item_b, item_c])
    session.commit()
    trips.attach(session, item_c, now)
    session.commit()

    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Lidl", receipt_total=14.60)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": "item-a", "price": 1.0, "price_per": None, "store": "Lidl"},
                {"item_id": "item-b", "price": 2.0, "price_per": None, "store": "Lidl"},
            ],
            "mappings": [],
        },
    )
    assert response.status_code == 200

    session.expire_all()
    a = session.get(ListItem, "item-a")
    b = session.get(ListItem, "item-b")
    c = session.get(ListItem, "item-c")
    assert a.purchase_id == b.purchase_id
    assert a.purchase_id != c.purchase_id

    closed_trip = session.get(Purchase, a.purchase_id)
    assert closed_trip.store == "Lidl"
    assert closed_trip.total == pytest.approx(14.60)
    assert closed_trip.closed_at is not None

    remaining_trip = session.get(Purchase, c.purchase_id)
    assert remaining_trip.closed_at is None


def test_patched_previously_unpurchased_item_gets_attached_to_a_trip(client, session, user):
    """A previous task found that receipt.py sets purchased_at directly and
    never attaches, which would leave purchased items with purchase_id NULL
    and break the invariant. Guards the patch-loop attach call specifically."""
    session.add(
        ListItem(
            id="item-pan-new",
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
                    "item_id": "item-pan-new",
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
    item = session.get(ListItem, "item-pan-new")
    assert item.purchase_id is not None


def test_impulse_new_item_gets_attached_to_a_trip(client, session):
    """An impulse buy from new_items must not land with purchase_id NULL."""
    client.post(f"/lists/{LIST_ID}/receipt-prices", json=_new_item_body())
    created = session.exec(select(ListItem).where(ListItem.name == "Chocolate negro 85%")).one()
    assert created.purchase_id is not None


def test_scan_purchase_id_is_set_when_one_trip_is_reconciled(client, session, user):
    session.add_all(
        [
            ListItem(
                id="item-x", list_id=LIST_ID, name="Item X", added_by=user.id, purchased_at=None
            ),
            ListItem(
                id="item-y", list_id=LIST_ID, name="Item Y", added_by=user.id, purchased_at=None
            ),
        ]
    )
    session.commit()
    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Lidl", receipt_total=9.99)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": "item-x", "price": 1.0, "price_per": None, "store": "Lidl"},
                {"item_id": "item-y", "price": 2.0, "price_per": None, "store": "Lidl"},
            ],
            "mappings": [],
        },
    )

    session.expire_all()
    x = session.get(ListItem, "item-x")
    scan_row = session.get(ReceiptScan, scan_id)
    assert scan_row.purchase_id is not None
    assert scan_row.purchase_id == x.purchase_id


def test_scan_spanning_two_trips_leaves_scan_purchase_id_null(client, session, user):
    """Matches across two different, already-reconciled trips must not be
    merged and must not pick one arbitrarily -- guessing which trip a receipt
    "meant" would be inventing a fact."""
    trip1 = Purchase(
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 1, 10, 0),
        tears_off_at=datetime(2026, 4, 1, 22, 0),
        closed_at=datetime(2026, 4, 1, 20, 0),
        store="Lidl",
        total=5.0,
    )
    trip2 = Purchase(
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 2, 10, 0),
        tears_off_at=datetime(2026, 4, 2, 22, 0),
        closed_at=datetime(2026, 4, 2, 20, 0),
        store="Mercadona",
        total=8.0,
    )
    session.add_all([trip1, trip2])
    session.commit()

    item_p = ListItem(
        id="item-p",
        list_id=LIST_ID,
        name="Item P",
        added_by=user.id,
        purchased_at=datetime(2026, 4, 1, 11, 0),
        purchase_id=trip1.id,
    )
    item_q = ListItem(
        id="item-q",
        list_id=LIST_ID,
        name="Item Q",
        added_by=user.id,
        purchased_at=datetime(2026, 4, 2, 11, 0),
        purchase_id=trip2.id,
    )
    session.add_all([item_p, item_q])
    session.commit()

    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Aldi", receipt_total=3.0)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": "item-p", "price": 1.0, "price_per": None, "store": "Lidl"},
                {"item_id": "item-q", "price": 2.0, "price_per": None, "store": "Mercadona"},
            ],
            "mappings": [],
        },
    )

    session.expire_all()
    assert session.get(ReceiptScan, scan_id).purchase_id is None
    assert session.get(Purchase, trip1.id).store == "Lidl"
    assert session.get(Purchase, trip2.id).store == "Mercadona"


def test_scan_confirming_a_torn_off_trip_fills_in_missing_store_and_total(client, session, user):
    trip = Purchase(
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 1, 10, 0),
        tears_off_at=datetime(2026, 4, 1, 22, 0),  # long torn off; never reconciled
    )
    session.add(trip)
    session.commit()

    item = ListItem(
        id="item-r",
        list_id=LIST_ID,
        name="Item R",
        added_by=user.id,
        purchased_at=datetime(2026, 4, 1, 11, 0),
        purchase_id=trip.id,
    )
    session.add(item)
    session.commit()

    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Lidl", receipt_total=6.5)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [{"item_id": "item-r", "price": 1.0, "price_per": None, "store": "Lidl"}],
            "mappings": [],
        },
    )

    session.expire_all()
    confirmed = session.get(Purchase, trip.id)
    assert confirmed.store == "Lidl"
    assert confirmed.total == pytest.approx(6.5)
    assert session.get(ReceiptScan, scan_id).purchase_id == trip.id


def test_scan_confirming_a_trip_with_existing_store_and_total_does_not_overwrite(
    client, session, user
):
    trip = Purchase(
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 1, 10, 0),
        tears_off_at=datetime(2026, 4, 1, 22, 0),
        store="Original Store",
        total=1.23,
    )
    session.add(trip)
    session.commit()

    item = ListItem(
        id="item-s",
        list_id=LIST_ID,
        name="Item S",
        added_by=user.id,
        purchased_at=datetime(2026, 4, 1, 11, 0),
        purchase_id=trip.id,
    )
    session.add(item)
    session.commit()

    scan = ReceiptScan(
        list_id=LIST_ID, scanned_by=user.id, store="Different Store", receipt_total=99.0
    )
    session.add(scan)
    session.commit()
    scan_id = scan.id

    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": "item-s", "price": 1.0, "price_per": None, "store": "Different Store"}
            ],
            "mappings": [],
        },
    )

    session.expire_all()
    confirmed = session.get(Purchase, trip.id)
    assert confirmed.store == "Original Store"
    assert confirmed.total == pytest.approx(1.23)
    # Confirming still closes it -- it just doesn't touch fields someone
    # already filled in.
    assert confirmed.closed_at is not None


def test_scan_spanning_a_closed_ticket_and_the_still_open_cart_reconciles_nothing(
    client, session, user
):
    """Critical repro: three items tap into one open trip; two are manually
    closed as a Lidl ticket; the third stays in the still-open cart. A scan
    matching all three must not attach its total to whichever trip happens to
    still be open -- that would confess the whole receipt's total to a single
    line while the other two silently keep a different, already-confirmed
    total."""
    a = client.post(f"/lists/{LIST_ID}/items", json={"name": "Item A"}).json()
    b = client.post(f"/lists/{LIST_ID}/items", json={"name": "Item B"}).json()
    c = client.post(f"/lists/{LIST_ID}/items", json={"name": "Item C"}).json()
    for item in (a, b, c):
        client.patch(f"/lists/{LIST_ID}/items/{item['id']}", json={"purchased": True})

    lidl = client.post(
        f"/lists/{LIST_ID}/purchases/close",
        json={
            "store": "Lidl",
            "total": 5.0,
            "lines": [{"item_id": a["id"]}, {"item_id": b["id"]}],
        },
    ).json()

    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Aldi", receipt_total=99.0)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [
                {"item_id": a["id"], "price": 1.0, "price_per": None, "store": "Aldi"},
                {"item_id": b["id"], "price": 2.0, "price_per": None, "store": "Aldi"},
                {"item_id": c["id"], "price": 3.0, "price_per": None, "store": "Aldi"},
            ],
            "mappings": [],
        },
    )

    session.expire_all()
    assert session.get(ReceiptScan, scan_id).purchase_id is None
    lidl_trip = session.get(Purchase, lidl["id"])
    assert lidl_trip.store == "Lidl"
    assert lidl_trip.total == pytest.approx(5.0)
    c_row = session.get(ListItem, c["id"])
    assert c_row.purchase_id != lidl["id"]
    c_trip = session.get(Purchase, c_row.purchase_id)
    assert c_trip.closed_at is None


def test_scan_confirming_a_torn_off_trip_closes_it_so_a_later_tap_cannot_join(
    client, session, user
):
    """Critical repro: an item backdated into an already-torn-off,
    unreconciled trip; a scan confirms only it. Confirming must close the
    trip -- otherwise trip_for's `closed_at IS NULL` lookup lets a later
    backdated tap for the same day join it, and the trip would go on
    reporting the scan's total as if it still covered both items."""
    three_days_ago = (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=3)).isoformat()

    first = client.post(f"/lists/{LIST_ID}/items", json={"name": "Item F"}).json()
    first = client.patch(
        f"/lists/{LIST_ID}/items/{first['id']}",
        json={"purchased": True, "purchased_at": three_days_ago},
    ).json()
    trip_id = first["purchase_id"]

    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Lidl", receipt_total=3.5)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "patches": [{"item_id": first["id"], "price": 3.5, "price_per": None, "store": "Lidl"}],
            "mappings": [],
        },
    )

    session.expire_all()
    trip = session.get(Purchase, trip_id)
    assert trip.store == "Lidl"
    assert trip.closed_at is not None

    second = client.post(f"/lists/{LIST_ID}/items", json={"name": "Item G"}).json()
    second = client.patch(
        f"/lists/{LIST_ID}/items/{second['id']}",
        json={"purchased": True, "purchased_at": three_days_ago},
    ).json()

    assert second["purchase_id"] != trip_id


def test_apply_receipt_prices_maps_not_in_the_cart_to_400(client, session, user, monkeypatch):
    """reconcile_scan -> close can raise NotInTheCart the same way a manual
    "Cerrar compra" can; purchases.py maps it to 400 there and this endpoint
    must too, rather than letting it surface as an unhandled 500. Forced via
    monkeypatch because every real path into `close` keeps `wanted` a subset
    of the cart by construction -- this exercises the handler, not a
    reachable state."""
    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Mercadona", receipt_total=1.15)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    def _raise_not_in_the_cart(*args, **kwargs):
        raise trips.NotInTheCart()

    monkeypatch.setattr(trips, "reconcile_scan", _raise_not_in_the_cart)

    resp = client.post(
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
            "mappings": [],
        },
    )
    assert resp.status_code == 400


def test_apply_receipt_prices_maps_nothing_to_close_to_409(client, session, user, monkeypatch):
    """Same as above for NothingToClose, which purchases.py maps to 409."""
    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, store="Mercadona", receipt_total=1.15)
    session.add(scan)
    session.commit()
    scan_id = scan.id

    def _raise_nothing_to_close(*args, **kwargs):
        raise trips.NothingToClose()

    monkeypatch.setattr(trips, "reconcile_scan", _raise_nothing_to_close)

    resp = client.post(
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
            "mappings": [],
        },
    )
    assert resp.status_code == 409
