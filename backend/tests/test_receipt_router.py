from datetime import UTC, datetime

import pytest
from sqlmodel import select

from app.db.models import List, ListItem, ListMember, Purchase, ReceiptNameMapping, ReceiptScan
from app.db.models import UserFeature as _UserFeature
from app.routers.receipt import _parse_receipt_at
from app.schemas.receipt import ReceiptPriceBatch

LIST_ID = "list-receipt-test"


@pytest.fixture(autouse=True)
def enable_receipt_flag(session, user):
    """Enable ai_receipt_scanning and grant consent so the endpoint tests
    exercise their own behaviour, not the gates in front of it."""
    row = _UserFeature(
        user_id=user.id,
        feature="ai_receipt_scanning",
        enabled=True,
        granted_by="admin",
    )
    user.receipt_consent = "granted"
    user.receipt_consent_at = datetime.now(UTC).replace(tzinfo=None)
    session.add_all([row, user])
    session.commit()


@pytest.fixture(autouse=True)
def seed_list(session, user):
    lst = List(id=LIST_ID, name="Test List", owner_id=user.id)
    member = ListMember(list_id=LIST_ID, user_id=user.id)
    # Pending, not purchased: the receipt matcher draws from what is still in
    # play — pending items and the open cart — so the canonical candidate is a
    # list item awaiting a shop. Scanning it is what marks it purchased and
    # closes the trip.
    item = ListItem(
        id="item-almendras",
        list_id=LIST_ID,
        name="Bebida de almendra 0% azúcares",
        added_by=user.id,
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


def test_post_receipt_persists_inference_source(client, session):
    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={**_unit_body(), "inference_source": "on_device"},
    )
    assert response.status_code == 200

    scan = session.get(ReceiptScan, response.json()["scan_id"])
    assert scan.inference_source == "on_device"


def test_post_receipt_inference_source_null_when_client_omits_it(client, session):
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200

    scan = session.get(ReceiptScan, response.json()["scan_id"])
    assert scan.inference_source is None


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


def test_post_receipt_infers_store_across_spelling_variants(client, session):
    """Two members spelled the same shop differently; inference must still
    see one store, and answer with a raw typed form, not the key."""
    item2 = ListItem(
        id="item-bacon",
        list_id=LIST_ID,
        name="Bacon lonchas",
        added_by=session.get(ListItem, "item-almendras").added_by,
        price_store="ahorra más",
    )
    item = session.get(ListItem, "item-almendras")
    item.price_store = "Ahorramás"
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
    assert response.json()["store"] == "Ahorramás"


def test_post_receipt_returns_kilogram_price_type(client, session):
    item = ListItem(
        id="item-bacon",
        list_id=LIST_ID,
        name="Bacon lonchas",
        added_by=session.get(ListItem, "item-almendras").added_by,
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


def test_post_receipt_matches_the_most_recently_updated_duplicate(client, session):
    """Two rows can share a name (a re-buy, say). Both are in the candidate pool,
    so the tiebreak is recency: match_lines keeps the first per name from a pool
    ordered pending-first then most-recently-updated, so the recent row wins."""
    old_item = session.get(ListItem, "item-almendras")
    old_item.name = "Leche entera"
    old_item.updated_at = datetime(2026, 4, 9, 9, 0, 0)
    session.add(old_item)

    recent_item = ListItem(
        id="item-leche-recent",
        list_id=LIST_ID,
        name="Leche entera",
        added_by=old_item.added_by,
        updated_at=datetime(2026, 4, 11, 15, 57, 0),
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


def test_post_receipt_excludes_items_settled_on_a_closed_purchase(client, session):
    """An item already filed on a closed (or torn-off) trip is out of the pool:
    a receipt records a new shop, it does not re-price a settled one."""
    from app.db.models import Purchase

    trip = Purchase(
        id="trip-closed",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 1, 9, 0, 0),
        tears_off_at=datetime(2026, 4, 2, 0, 0, 0),
        closed_at=datetime(2026, 4, 2, 0, 0, 0),
    )
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 4, 1, 10, 0, 0)
    item.purchase_id = "trip-closed"
    session.add_all([trip, item])
    session.commit()

    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 0
    assert len(body["unmatched"]) == 1


def test_post_receipt_includes_items_in_the_open_cart(client, session):
    """Items already in the open cart (purchased this trip, not yet closed) stay
    matchable — the receipt is what closes that cart."""
    from app.db.models import Purchase

    trip = Purchase(
        id="trip-open",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 11, 9, 0, 0),
        # Far-future tear-off so the cart reads as open whenever the suite runs.
        tears_off_at=datetime(2099, 1, 1, 0, 0, 0),
    )
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 4, 11, 10, 0, 0)
    item.purchase_id = "trip-open"
    session.add_all([trip, item])
    session.commit()

    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-almendras"


def test_post_receipt_excludes_open_cart_items_whose_trip_has_a_scan(client, session, user):
    """A scan attached to a trip means the paper already claimed it: its lines
    leave the pool even while the trip's boundary is still ahead."""
    trip = Purchase(
        id="trip-open-scanned",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 11, 9, 0, 0),
        tears_off_at=datetime(2099, 1, 1, 0, 0, 0),
    )
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 4, 11, 10, 0, 0)
    item.purchase_id = "trip-open-scanned"
    scan = ReceiptScan(list_id=LIST_ID, scanned_by=user.id, purchase_id="trip-open-scanned")
    session.add_all([trip, item, scan])
    session.commit()

    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 0
    assert len(body["unmatched"]) == 1


def test_receipt_prices_skips_an_item_settled_under_a_ticket(client, session):
    """An ordinary apply never rewrites figures a closed ticket already
    confirmed — the patch is refused and reported, not applied."""
    trip = Purchase(
        id="trip-ticketed",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 1, 9, 0, 0),
        tears_off_at=datetime(2026, 4, 2, 0, 0, 0),
        closed_at=datetime(2026, 4, 2, 0, 0, 0),
    )
    item = session.get(ListItem, "item-almendras")
    item.purchased_at = datetime(2026, 4, 1, 10, 0, 0)
    item.purchase_id = "trip-ticketed"
    item.price = 1.05
    session.add_all([trip, item])
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "patches": [
                {
                    "item_id": "item-almendras",
                    "price": 9.99,
                    "price_per": None,
                    "store": "Lidl",
                    "quantity": "2 UD",
                }
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["items_updated"] == 0
    assert body["items_skipped"] == 1

    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.price == pytest.approx(1.05)
    assert item.price_store is None
    assert item.purchased_quantity is None


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


RECEIPT_ENDPOINT_BODIES = [
    ("receipt", _unit_body()),
    ("receipt-prices", {"scan_id": None, "patches": [], "mappings": []}),
]


@pytest.mark.parametrize("consent", [None, "declined"])
@pytest.mark.parametrize(("endpoint", "body"), RECEIPT_ENDPOINT_BODIES)
def test_endpoints_return_403_without_consent(client, session, user, consent, endpoint, body):
    """With the flag on but consent unset or declined, both receipt endpoints
    must refuse with a detail distinct from the flag's, so the UI can tell
    "not available to you" from "you have not agreed yet"."""
    user.receipt_consent = consent
    session.add(user)
    session.commit()

    response = client.post(f"/lists/{LIST_ID}/{endpoint}", json=body)
    assert response.status_code == 403
    assert response.json()["detail"] == "receipt_consent_required"


@pytest.mark.parametrize(("endpoint", "body"), RECEIPT_ENDPOINT_BODIES)
def test_endpoints_pass_consent_gate_when_granted(client, endpoint, body):
    # The autouse fixture grants both the flag and consent.
    response = client.post(f"/lists/{LIST_ID}/{endpoint}", json=body)
    assert response.status_code == 200


@pytest.mark.parametrize("consent", [None, "granted", "declined"])
@pytest.mark.parametrize(("endpoint", "body"), RECEIPT_ENDPOINT_BODIES)
def test_flag_gate_answers_first_regardless_of_consent(
    session, other_user, other_client, consent, endpoint, body
):
    """Without the flag, the flag's own 403 detail is the answer even for a
    user who granted consent — the two refusals must never blur."""
    from app.db.models import List, ListMember

    lst = List(id="list-receipt-other", name="Other List", owner_id=other_user.id)
    mem = ListMember(list_id="list-receipt-other", user_id=other_user.id)
    other_user.receipt_consent = consent
    session.add_all([lst, mem, other_user])
    session.commit()

    response = other_client.post(f"/lists/list-receipt-other/{endpoint}", json=body)
    assert response.status_code == 403
    assert response.json()["detail"] == "ai_receipt_scanning feature not enabled"


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
    """A co-shopper may already have this line in the open cart; applying the
    receipt closes the trip but must not rewrite its purchased_at. updated_at
    must not move either: bumping it would reopen the unpurchase grace window
    and let the co-shopper's purchase be reverted."""
    from app.db.models import Purchase

    # Already in the open cart, purchased by someone earlier in the trip.
    trip = Purchase(
        id="trip-open-ts",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 8, 9, 0, 0),
        tears_off_at=datetime(2099, 1, 1, 0, 0, 0),
    )
    original_item = session.get(ListItem, "item-almendras")
    original_item.purchased_at = datetime(2026, 4, 8, 10, 0, 0)
    original_item.purchase_id = "trip-open-ts"
    session.add_all([trip, original_item])
    session.commit()

    original = original_item.purchased_at
    original_updated_at = original_item.updated_at

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
    item = session.get(ListItem, "item-almendras")
    assert item.purchased_at == original
    assert item.updated_at == original_updated_at


def test_receipt_prices_stamps_updated_at(client, session, user):
    """The unpurchase grace window keys off updated_at. If this write does not
    move it, a backdated purchase can never be reverted."""
    session.add(
        ListItem(
            id="item-queso",
            list_id=LIST_ID,
            name="Queso curado",
            added_by=user.id,
            purchased_at=None,
            updated_at=datetime(2026, 1, 1),
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
                    "item_id": "item-queso",
                    "price": 4.5,
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
    item = session.get(ListItem, "item-queso")
    assert item.purchased_at == datetime(2026, 4, 11, 17, 42)
    assert item.updated_at > datetime(2026, 4, 11, 17, 42)


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
    assert response.json() == {"items_updated": 1, "items_created": 1, "items_skipped": 0}


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


def _mapping_batch(store: str, receipt_name: str, item_name: str) -> dict:
    return {
        "scan_id": None,
        "receipt_date": "2026-04-11T17:42:00Z",
        "patches": [],
        "new_items": [],
        "mappings": [
            {
                "store": store,
                "receipt_name": receipt_name,
                "item_name": item_name,
                "item_brand": None,
            }
        ],
    }


def test_receipt_prices_stores_mappings_key_normalised(client, session):
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_mapping_batch("Ahorra Más", "D.CREME  SELECCIÓN", "Bombones surtidos"),
    )
    assert response.status_code == 200

    row = session.exec(select(ReceiptNameMapping)).one()
    assert row.store == "ahorramas"
    assert row.receipt_name == "d.creme seleccion"
    assert row.item_name == "Bombones surtidos"


def test_receipt_prices_upsert_folds_spelling_variants(client, session):
    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_mapping_batch("Ahorra Más", "MANÍ DULCE", "Maní dulce"),
    )
    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_mapping_batch("AHORRAMAS", "mani  dulce", "Maní dulce"),
    )

    rows = session.exec(select(ReceiptNameMapping)).all()
    assert len(rows) == 1
    assert rows[0].use_count == 2


def test_mapping_written_by_apply_is_found_by_the_next_scan(client, session, user):
    """The whole point of the table: confirm once, match forever. The write
    and the read must derive the same key from different spellings."""
    session.add(
        ListItem(
            id="item-bombones",
            list_id=LIST_ID,
            name="Bombones surtidos",
            added_by=user.id,
        )
    )
    session.commit()

    client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_mapping_batch("Ahorra Más", "D.CREME SELECTION", "Bombones surtidos"),
    )

    response = client.post(
        f"/lists/{LIST_ID}/receipt",
        json={
            "store": "AHORRAMAS",
            "receipt_date": "2026-04-11",
            "receipt_total": 4.50,
            "lines": [
                {
                    "name": "D.CREME SELECTION",
                    "price_type": "UNIT",
                    "unit_price": 4.50,
                    "quantity": None,
                    "line_total": 4.50,
                }
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-bombones"


def test_receipt_apply_closes_the_trip_back_dated_to_the_receipt(client, session, user):
    """A receipt records a finished shop, so applying it settles the line onto a
    CLOSED trip filed under the receipt's day — not a lingering open cart. The
    line's purchased_at is the receipt instant; the trip's boundaries are that
    day's midnight and tear-off (client tz defaults to UTC here)."""
    from app.db.models import Purchase

    session.add(
        ListItem(
            id="item-pan-trip",
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
            "store": "Mercadona",
            "receipt_total": 1.25,
            "patches": [
                {
                    "item_id": "item-pan-trip",
                    "price": 1.25,
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
    item = session.get(ListItem, "item-pan-trip")
    assert item.purchased_at == datetime(2026, 4, 11, 17, 42)
    assert item.purchase_id is not None
    trip = session.get(Purchase, item.purchase_id)
    assert trip.list_id == LIST_ID
    assert trip.closed_at is not None
    assert trip.opened_at == datetime(2026, 4, 11, 0, 0)
    assert trip.tears_off_at == datetime(2026, 4, 12, 0, 0)
    assert trip.store == "Mercadona"
    assert trip.total == pytest.approx(1.25)


def test_receipt_apply_created_items_join_the_same_open_trip(client, session, user):
    from sqlmodel import select as sql_select

    from app.db.models import Purchase

    session.add(
        ListItem(
            id="item-pan-trip2",
            list_id=LIST_ID,
            name="Pan de molde",
            added_by=user.id,
            purchased_at=None,
        )
    )
    session.commit()

    body = _new_item_body()
    body["patches"] = [
        {
            "item_id": "item-pan-trip2",
            "price": 1.25,
            "price_per": None,
            "store": "Mercadona",
            "quantity": None,
        }
    ]
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 200

    session.expire_all()
    patched = session.get(ListItem, "item-pan-trip2")
    created = session.exec(sql_select(ListItem).where(ListItem.name == "Chocolate negro 85%")).one()
    assert patched.purchase_id is not None
    assert created.purchase_id == patched.purchase_id
    assert len(session.exec(sql_select(Purchase)).all()) == 1


def test_receipt_apply_stamps_the_trip_boundary_in_the_clients_zone(client, session, user):
    from zoneinfo import ZoneInfo

    from app.db.models import Purchase
    from app.services.trips import tears_off_at_for

    session.add(
        ListItem(
            id="item-pan-trip3",
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
                    "item_id": "item-pan-trip3",
                    "price": 1.25,
                    "price_per": None,
                    "store": "Mercadona",
                    "quantity": None,
                }
            ],
            "new_items": [],
            "mappings": [],
        },
        headers={"X-Client-Timezone": "Etc/GMT+12"},
    )
    assert response.status_code == 200

    session.expire_all()
    item = session.get(ListItem, "item-pan-trip3")
    trip = session.get(Purchase, item.purchase_id)
    assert trip.tears_off_at == tears_off_at_for(trip.opened_at, ZoneInfo("Etc/GMT+12"))


def test_apply_with_nothing_to_settle_closes_no_trip(client, session):
    """A body that settles no line — only a mapping to learn — claims nothing
    about a shop, so no cart is opened or closed as a side effect."""
    from sqlmodel import select as sql_select

    from app.db.models import Purchase

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_mapping_batch("Mercadona", "BEBIDA ALMENDRAS 0%", "Bebida de almendra 0% azúcares"),
    )
    assert response.status_code == 200
    assert session.exec(sql_select(Purchase)).all() == []


def test_receipt_apply_links_the_scan_to_the_trip_it_filed(client, session, user):
    """The link is what the purchase page's has_receipt reads."""
    session.add(
        ListItem(
            id="item-pan-link",
            list_id=LIST_ID,
            name="Pan de molde",
            added_by=user.id,
            purchased_at=None,
        )
    )
    session.commit()
    scan_id = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body()).json()["scan_id"]

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            "scan_id": scan_id,
            "receipt_date": "2026-04-11T17:42:00Z",
            "patches": [
                {
                    "item_id": "item-pan-link",
                    "price": 1.25,
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
    scan = session.get(ReceiptScan, scan_id)
    item = session.get(ListItem, "item-pan-link")
    assert scan.purchase_id is not None
    assert scan.purchase_id == item.purchase_id


def test_apply_with_nothing_to_settle_leaves_the_scan_unlinked(client, session):
    """No trip was closed, so the scan reconciled nothing — the link stays NULL
    rather than pointing at a trip this apply never touched."""
    scan_id = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body()).json()["scan_id"]

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json={
            **_mapping_batch("Mercadona", "BEBIDA ALMENDRAS 0%", "Bebida de almendra 0% azúcares"),
            "scan_id": scan_id,
        },
    )
    assert response.status_code == 200

    session.expire_all()
    assert session.get(ReceiptScan, scan_id).purchase_id is None


# --- Targeted attach: a scan completes a settled purchase (25b) ---

SETTLED_ID = "trip-settled"
SETTLED_WRITE = datetime(2026, 4, 1, 10, 0, 0)


@pytest.fixture
def settled_trip(session, user):
    """A closed purchase with one priced and one unpriced line, plus a pending
    look-alike of the unpriced one to prove the targeted pool excludes it."""
    trip = Purchase(
        id=SETTLED_ID,
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 1, 9, 0, 0),
        tears_off_at=datetime(2026, 4, 2, 0, 0, 0),
        closed_at=datetime(2026, 4, 2, 0, 0, 0),
        store="Mercadona",
        total=None,
    )
    priced = ListItem(
        id="item-settled-priced",
        list_id=LIST_ID,
        name="Yogur natural",
        added_by=user.id,
        purchased_at=SETTLED_WRITE,
        purchase_id=SETTLED_ID,
        price=2.50,
        price_store="Mercadona",
        updated_at=SETTLED_WRITE,
    )
    unpriced = ListItem(
        id="item-settled-unpriced",
        list_id=LIST_ID,
        name="Pan integral",
        added_by=user.id,
        purchased_at=SETTLED_WRITE,
        purchase_id=SETTLED_ID,
        updated_at=SETTLED_WRITE,
    )
    lookalike = ListItem(
        id="item-lookalike",
        list_id=LIST_ID,
        name="Pan integral",
        added_by=user.id,
    )
    session.add_all([trip, priced, unpriced, lookalike])
    session.commit()
    return trip


def _targeted_scan_body(**overrides):
    body = {
        "store": "Mercadona",
        "receipt_date": "2026-04-01",
        "receipt_total": None,
        "lines": [
            {
                "name": "PAN INTEGRAL",
                "price_type": "UNIT",
                "unit_price": 1.10,
                "quantity": None,
                "line_total": 1.10,
            }
        ],
        "purchase_id": SETTLED_ID,
    }
    body.update(overrides)
    return body


def _targeted_batch(**overrides):
    body = {
        "scan_id": None,
        "receipt_date": "2026-04-01",
        "store": "Mercadona",
        "receipt_total": None,
        "patches": [],
        "new_items": [],
        "mappings": [],
        "purchase_id": SETTLED_ID,
    }
    body.update(overrides)
    return body


def _price_patch(item_id, price, store="Mercadona"):
    return {
        "item_id": item_id,
        "price": price,
        "price_per": None,
        "store": store,
        "quantity": None,
    }


def test_targeted_scan_matches_only_the_purchases_lines(client, settled_trip):
    """The targeted pool is the named ticket's own lines — a pending item with
    the same name never steals the match."""
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_targeted_scan_body())
    assert response.status_code == 200
    body = response.json()
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-settled-unpriced"


def test_targeted_scan_returns_404_for_an_unknown_purchase(client):
    response = client.post(
        f"/lists/{LIST_ID}/receipt", json=_targeted_scan_body(purchase_id="no-such-trip")
    )
    assert response.status_code == 404


def test_targeted_scan_returns_404_for_another_lists_purchase(client, session, user):
    other = List(id="list-other", name="Other", owner_id=user.id)
    trip = Purchase(
        id="trip-elsewhere",
        list_id="list-other",
        opened_at=datetime(2026, 4, 1, 9, 0, 0),
        tears_off_at=datetime(2026, 4, 2, 0, 0, 0),
        closed_at=datetime(2026, 4, 2, 0, 0, 0),
    )
    session.add_all([other, trip])
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt", json=_targeted_scan_body(purchase_id="trip-elsewhere")
    )
    assert response.status_code == 404


def test_targeted_scan_returns_409_for_the_open_cart(client, session):
    cart = Purchase(
        id="trip-cart",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 11, 9, 0, 0),
        tears_off_at=datetime(2099, 1, 1, 0, 0, 0),
    )
    session.add(cart)
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt", json=_targeted_scan_body(purchase_id="trip-cart")
    )
    assert response.status_code == 409


def test_targeted_scan_does_not_link_the_scan_before_apply(client, session, settled_trip):
    """The link still means "the trip this scan reconciled" — an abandoned
    review reconciled nothing, so only the apply writes it."""
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_targeted_scan_body())
    scan_id = response.json()["scan_id"]

    session.expire_all()
    assert session.get(ReceiptScan, scan_id).purchase_id is None


def test_targeted_apply_fills_and_updates_prices_without_stamping_updated_at(
    client, session, settled_trip
):
    """Prices fill and correct, but the lines stay settled exactly as written:
    purchased_at, purchase_id, and updated_at untouched — a stamped updated_at
    would reopen the unpurchase grace window on an old purchase."""
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_targeted_batch(
            patches=[
                _price_patch("item-settled-unpriced", 1.10),
                _price_patch("item-settled-priced", 2.75),
            ]
        ),
    )
    assert response.status_code == 200
    assert response.json()["items_updated"] == 2

    session.expire_all()
    filled = session.get(ListItem, "item-settled-unpriced")
    corrected = session.get(ListItem, "item-settled-priced")
    assert filled.price == pytest.approx(1.10)
    assert corrected.price == pytest.approx(2.75)
    for item in (filled, corrected):
        assert item.purchased_at == SETTLED_WRITE
        assert item.purchase_id == SETTLED_ID
        assert item.updated_at == SETTLED_WRITE


def test_targeted_apply_skips_a_patch_for_an_item_not_on_the_purchase(
    client, session, settled_trip
):
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_targeted_batch(patches=[_price_patch("item-lookalike", 1.10)]),
    )
    assert response.status_code == 200
    assert response.json()["items_updated"] == 0
    assert response.json()["items_skipped"] == 1

    session.expire_all()
    lookalike = session.get(ListItem, "item-lookalike")
    assert lookalike.price is None
    assert lookalike.purchased_at is None


def test_targeted_apply_files_new_lines_on_the_purchase(client, session, settled_trip):
    """A line the record never had files onto the named ticket at its opening,
    with a fresh updated_at so the just-written line stays revertible."""
    before = datetime.now(UTC).replace(tzinfo=None)
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_targeted_batch(
            new_items=[
                {
                    "name": "Chicles",
                    "brand": None,
                    "ean": None,
                    "price": 0.90,
                    "price_per": None,
                    "store": "Mercadona",
                    "quantity": None,
                }
            ]
        ),
    )
    assert response.status_code == 200
    assert response.json()["items_created"] == 1

    session.expire_all()
    line = session.exec(select(ListItem).where(ListItem.name == "Chicles")).one()
    assert line.purchase_id == SETTLED_ID
    assert line.purchased_at == settled_trip.opened_at
    assert line.updated_at >= before


def test_targeted_apply_fills_a_null_total(client, session, settled_trip):
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices", json=_targeted_batch(receipt_total=12.30)
    )
    assert response.status_code == 200

    session.expire_all()
    assert session.get(Purchase, SETTLED_ID).total == pytest.approx(12.30)


def test_targeted_apply_updates_a_differing_total(client, session, settled_trip):
    settled_trip.total = 10.00
    session.add(settled_trip)
    session.commit()

    client.post(f"/lists/{LIST_ID}/receipt-prices", json=_targeted_batch(receipt_total=12.30))

    session.expire_all()
    assert session.get(Purchase, SETTLED_ID).total == pytest.approx(12.30)


def test_targeted_apply_keeps_the_total_when_the_paper_had_none(client, session, settled_trip):
    """An unreadable paper total never blanks a figure someone confirmed."""
    settled_trip.total = 10.00
    session.add(settled_trip)
    session.commit()

    client.post(f"/lists/{LIST_ID}/receipt-prices", json=_targeted_batch(receipt_total=None))

    session.expire_all()
    assert session.get(Purchase, SETTLED_ID).total == pytest.approx(10.00)


def test_targeted_apply_leaves_store_and_dating_untouched(client, session, settled_trip):
    """The record's identity — store and every boundary timestamp — stays where
    reconciliation wrote it, even when the body carries a different store."""
    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_targeted_batch(
            store="Lidl",
            patches=[_price_patch("item-settled-unpriced", 1.10, store="Lidl")],
        ),
    )
    assert response.status_code == 200

    session.expire_all()
    trip = session.get(Purchase, SETTLED_ID)
    assert trip.store == "Mercadona"
    assert trip.opened_at == datetime(2026, 4, 1, 9, 0, 0)
    assert trip.tears_off_at == datetime(2026, 4, 2, 0, 0, 0)
    assert trip.closed_at == datetime(2026, 4, 2, 0, 0, 0)
    # The line's own store note does take the paper's word.
    assert session.get(ListItem, "item-settled-unpriced").price_store == "Lidl"


def test_targeted_apply_closes_no_trip(client, session, settled_trip, user):
    """A concurrently open cart stays open and unclaimed, and no new purchase
    row appears — the targeted apply settles nothing new."""
    cart = Purchase(
        id="trip-cart",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 11, 9, 0, 0),
        tears_off_at=datetime(2099, 1, 1, 0, 0, 0),
    )
    in_cart = ListItem(
        id="item-in-cart",
        list_id=LIST_ID,
        name="Leche entera",
        added_by=user.id,
        purchased_at=datetime(2026, 4, 11, 10, 0, 0),
        purchase_id="trip-cart",
    )
    session.add_all([cart, in_cart])
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_targeted_batch(patches=[_price_patch("item-settled-unpriced", 1.10)]),
    )
    assert response.status_code == 200

    session.expire_all()
    assert session.get(Purchase, "trip-cart").closed_at is None
    assert session.get(ListItem, "item-in-cart").purchase_id == "trip-cart"
    assert len(session.exec(select(Purchase)).all()) == 2


def test_targeted_apply_links_the_scan_to_the_purchase(client, session, settled_trip):
    scan_id = client.post(f"/lists/{LIST_ID}/receipt", json=_targeted_scan_body()).json()["scan_id"]

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices",
        json=_targeted_batch(
            scan_id=scan_id, patches=[_price_patch("item-settled-unpriced", 1.10)]
        ),
    )
    assert response.status_code == 200

    session.expire_all()
    scan = session.get(ReceiptScan, scan_id)
    assert scan.purchase_id == SETTLED_ID
    assert scan.items_updated == 1


def test_targeted_apply_returns_409_for_the_open_cart(client, session):
    cart = Purchase(
        id="trip-cart",
        list_id=LIST_ID,
        opened_at=datetime(2026, 4, 11, 9, 0, 0),
        tears_off_at=datetime(2099, 1, 1, 0, 0, 0),
    )
    session.add(cart)
    session.commit()

    response = client.post(
        f"/lists/{LIST_ID}/receipt-prices", json=_targeted_batch(purchase_id="trip-cart")
    )
    assert response.status_code == 409


def test_receipt_price_batch_defaults_purchase_id_none():
    batch = ReceiptPriceBatch(patches=[], new_items=[], mappings=[])
    assert batch.purchase_id is None


# --- Illegible captures: a zero-line scan still leaves a record (18c) ---


def test_zero_line_scan_persists_a_lineless_record(client, session):
    """An unreadable ticket is still a scan: the row exists so the capture has
    somewhere to live, and the 18c save can later name it."""
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body() | {"lines": []})
    assert response.status_code == 200
    result = response.json()
    assert result["matched"] == []
    assert result["unmatched"] == []

    scan = session.get(ReceiptScan, result["scan_id"])
    assert scan.parsed_lines == []
    assert scan.purchase_id is None


def test_zero_line_scan_survives_store_inference_with_no_store(client, session):
    """No store and no lines: the inference pass has nothing to work with and
    must pass through rather than crash."""
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body(store=None) | {"lines": []})
    assert response.status_code == 200
    assert response.json()["store"] is None


def test_targeted_zero_line_scan_links_at_creation(client, session, settled_trip):
    """Zero lines means no review opens, so no apply will ever write the link —
    creation is the one chance to give the named record its capture."""
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_targeted_scan_body(lines=[]))
    assert response.status_code == 200
    scan_id = response.json()["scan_id"]

    session.expire_all()
    assert session.get(ReceiptScan, scan_id).purchase_id == SETTLED_ID
