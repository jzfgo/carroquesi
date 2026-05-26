import io
import pytest
from datetime import datetime
from unittest.mock import patch

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


FAKE_OCR_TEXT = """MERCADONA, S.A.
11/04/2026 15:57

Descripcion           Importe
BEBIDA ALMENDRAS 0%      1,15

TOTAL                    1,15
"""


def test_post_receipt_returns_scan_result(client):
    with patch("app.routers.receipt.extract_text", return_value=FAKE_OCR_TEXT), \
         patch("app.routers.receipt.store_image", return_value=None):
        image_data = io.BytesIO(b"fake-image-bytes")
        response = client.post(
            f"/lists/{LIST_ID}/receipt",
            files={"image": ("receipt.jpg", image_data, "image/jpeg")},
        )
    assert response.status_code == 200
    body = response.json()
    assert "scan_id" in body
    assert body["store"] == "Mercadona"
    assert len(body["matched"]) == 1
    assert body["matched"][0]["item_id"] == "item-almendras"
    assert body["matched"][0]["price"] == pytest.approx(1.15)


def test_post_receipt_422_when_no_text(client):
    with patch("app.routers.receipt.extract_text", return_value=""), \
         patch("app.routers.receipt.store_image", return_value=None):
        image_data = io.BytesIO(b"blank")
        response = client.post(
            f"/lists/{LIST_ID}/receipt",
            files={"image": ("blank.jpg", image_data, "image/jpeg")},
        )
    assert response.status_code == 422


def test_post_receipt_prices_writes_price(client, session):
    with patch("app.routers.receipt.extract_text", return_value=FAKE_OCR_TEXT), \
         patch("app.routers.receipt.store_image", return_value=None):
        image_data = io.BytesIO(b"fake-image-bytes")
        scan_response = client.post(
            f"/lists/{LIST_ID}/receipt",
            files={"image": ("receipt.jpg", image_data, "image/jpeg")},
        )
    scan_id = scan_response.json()["scan_id"]

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
