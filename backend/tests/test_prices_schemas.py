from app.schemas.prices import PriceCreate, PriceEntry, PriceHistoryResponse


def test_price_create_defaults():
    p = PriceCreate(amount=1.99)
    assert p.price_per is None
    assert p.store is None


def test_price_create_kilogram():
    p = PriceCreate(amount=3.20, price_per="KILOGRAM", store="Mercadona")
    assert p.price_per == "KILOGRAM"
    assert p.store == "Mercadona"


def test_price_create_rejects_zero():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        PriceCreate(amount=0)


def test_price_history_response_structure():
    entry = PriceEntry(amount=1.99, price_per=None, store="Mercadona")
    resp = PriceHistoryResponse(entries=[entry], community_price=1.85, community_price_per=None)
    assert len(resp.entries) == 1
    assert resp.entries[0].amount == 1.99
    assert resp.community_price == 1.85


def test_price_history_empty():
    resp = PriceHistoryResponse(entries=[])
    assert resp.entries == []
    assert resp.community_price is None
