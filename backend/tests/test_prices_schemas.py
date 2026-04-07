from datetime import datetime
from app.schemas.prices import PriceCreate, PriceRecordRead, PriceHistoryResponse, StoreGroup


def test_price_create_defaults():
    p = PriceCreate(amount=1.99)
    assert p.price_per is None
    assert p.store is None


def test_price_create_kilogram():
    p = PriceCreate(amount=3.20, price_per="KILOGRAM", store="Mercadona")
    assert p.price_per == "KILOGRAM"
    assert p.store == "Mercadona"


def test_price_history_response_structure():
    record = PriceRecordRead(
        id="abc",
        list_item_id="item1",
        ean="123",
        amount=1.99,
        price_per=None,
        store="Mercadona",
        user_id="user1",
        recorded_at=datetime.now(),
    )
    group = StoreGroup(store="Mercadona", records=[record])
    resp = PriceHistoryResponse(
        groups=[group],
        community_price=1.85,
        community_price_per=None,
    )
    assert len(resp.groups) == 1
    assert resp.community_price == 1.85
    assert resp.community_price_per is None


def test_price_history_empty():
    resp = PriceHistoryResponse(groups=[])
    assert resp.groups == []
    assert resp.community_price is None
