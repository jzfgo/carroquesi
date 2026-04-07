from app.db.models import PriceCache, PriceRecord, ListItem


def test_listitem_has_ean():
    fields = ListItem.model_fields
    assert "ean" in fields
    assert fields["ean"].default is None


def test_price_cache_fields():
    fields = PriceCache.model_fields
    assert "ean" in fields
    assert "amount" in fields
    assert "price_per" in fields
    assert "fetched_at" in fields


def test_price_record_fields():
    fields = PriceRecord.model_fields
    for f in ("list_item_id", "ean", "amount", "price_per", "store", "user_id", "recorded_at"):
        assert f in PriceRecord.model_fields


def test_price_cache_instantiation():
    cache = PriceCache(ean="1234567890123", amount=1.99)
    assert cache.id is not None
    assert cache.fetched_at is not None
    assert cache.price_per is None


def test_price_record_instantiation():
    record = PriceRecord(
        list_item_id="test-item-id",
        amount=0.89,
        user_id="test-user-id",
    )
    assert record.id is not None
    assert record.recorded_at is not None
    assert record.ean is None
    assert record.store is None
