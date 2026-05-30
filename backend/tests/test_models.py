from app.db.models import PriceCache, ListItem


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


def test_price_cache_instantiation():
    cache = PriceCache(ean="1234567890123", amount=1.99)
    assert cache.id is not None
    assert cache.fetched_at is not None
    assert cache.price_per is None


def test_list_item_has_price_fields():
    from app.db.models import ListItem
    item = ListItem(
        list_id="list-1",
        name="Leche",
        added_by="user-1",
        price=1.29,
        price_per=None,
        price_store="Mercadona",
    )
    assert item.price == 1.29
    assert item.price_store == "Mercadona"
    assert item.price_per is None


def test_price_record_does_not_exist():
    import app.db.models as m
    assert not hasattr(m, 'PriceRecord')


def test_feedback_submission_fields():
    from app.db.models import FeedbackSubmission

    fields = FeedbackSubmission.model_fields
    assert "user_id" in fields
    assert "message" in fields
    assert "email" in fields
    assert "source" in fields
    assert "user_agent" in fields
    assert "created_at" in fields

    feedback = FeedbackSubmission(user_id="user-1", message="Great app")
    assert feedback.id is not None
    assert feedback.source == "manual"
    assert feedback.email is None
    assert feedback.user_agent is None
    assert feedback.created_at is not None
