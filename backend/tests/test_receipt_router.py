from datetime import date, datetime

import pytest
from sqlmodel import select

from app.db.models import List, ListItem, ListMember, ReceiptScan
from app.db.models import UserFeature as _UserFeature
from app.routers.receipt import _parse_receipt_at, _receipt_day

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
    assert body["matched"][0]["index"] == 0


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
