import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db.models import ListItem, ReceiptNameMapping
from app.schemas.receipt import ParsedLine
from app.services.receipt_matcher import match_lines, normalise


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _item(item_id: str, name: str, price_store: str | None = None) -> ListItem:
    return ListItem(
        id=item_id,
        list_id="list-1",
        name=name,
        added_by="user-1",
        price_store=price_store,
    )


def _unit(name: str, price: float) -> ParsedLine:
    return ParsedLine(name=name, price_type="UNIT", unit_price=price, line_total=price)


def test_normalise_lowercases():
    assert normalise("BEBIDA ALMENDRAS") == "bebida almendras"


def test_normalise_strips_accents():
    assert normalise("Bebída") == "bebida"


def test_normalise_strips_leading_quantity():
    assert normalise("2 BOLSA PLASTICO") == "bolsa plastico"


def test_normalise_collapses_whitespace():
    assert normalise("  pan   de  molde  ") == "pan de molde"


def test_match_via_fuzzy(session):
    items = [_item("item-1", "Bebida de almendra 0% azúcares")]
    matched, unmatched = match_lines(
        [_unit("BEBIDA ALMENDRAS 0%", 1.15)], "Mercadona", items, session
    )
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"
    assert matched[0].unit_price == pytest.approx(1.15)
    assert matched[0].price_type == "UNIT"
    assert len(unmatched) == 0


def test_unmatched_when_score_too_low(session):
    items = [_item("item-1", "Bebida de almendra")]
    matched, unmatched = match_lines([_unit("XXXXXX ZZZZ", 9.99)], "Mercadona", items, session)
    assert len(matched) == 0
    assert len(unmatched) == 1
    assert unmatched[0].receipt_name == "XXXXXX ZZZZ"


def test_mapping_lookup_takes_priority(session):
    mapping = ReceiptNameMapping(
        id="map-1",
        store="Mercadona",
        receipt_name="mani dulce",
        item_name="Maní dulce",
        confirmed_by="user-1",
    )
    session.add(mapping)
    session.commit()

    items = [_item("item-1", "Maní dulce"), _item("item-2", "Frutos secos mix")]
    matched, unmatched = match_lines([_unit("MANI DULCE", 3.15)], "Mercadona", items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"


def test_kilogram_line_carries_quantity(session):
    items = [_item("item-1", "Bacon lonchas")]
    line = ParsedLine(
        name="BACON LONCHAS",
        price_type="KILOGRAM",
        unit_price=11.40,
        quantity=0.202,
        line_total=2.30,
    )
    matched, unmatched = match_lines([line], "Mercadona", items, session)
    assert matched[0].price_type == "KILOGRAM"
    assert matched[0].unit_price == pytest.approx(11.40)
    assert matched[0].quantity == pytest.approx(0.202)
    assert matched[0].line_total == pytest.approx(2.30)


def test_fuzzy_match_prefers_most_recent_duplicate(session):
    # purchased_items is expected to arrive ordered most-recently-purchased
    # first (see receipt.py's order_by); a re-bought item can produce two
    # rows with the same name, and the fuzzy match must pick the recent one.
    items = [_item("item-recent", "Leche"), _item("item-old", "Leche")]
    matched, unmatched = match_lines([_unit("LECHE", 1.10)], "Mercadona", items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-recent"
    assert len(unmatched) == 0


def test_mapping_lookup_prefers_most_recent_duplicate(session):
    mapping = ReceiptNameMapping(
        id="map-1",
        store="Mercadona",
        receipt_name="leche",
        item_name="Leche",
        confirmed_by="user-1",
    )
    session.add(mapping)
    session.commit()

    items = [_item("item-recent", "Leche"), _item("item-old", "Leche")]
    matched, unmatched = match_lines([_unit("LECHE", 1.10)], "Mercadona", items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-recent"


def test_mapping_lookup_dedupes_case_and_accent_duplicates(session):
    # Re-adding an already-purchased item doesn't reuse the exact stored
    # casing (see items.py's case-insensitive-but-purchased-excluding dup
    # check), so two purchased rows can differ only in case/accents. A
    # mapping learned against the stale casing ("leche") must not resolve to
    # the item that dedup already dropped in favour of the first-seen one.
    mapping = ReceiptNameMapping(
        id="map-1",
        store="Mercadona",
        receipt_name="leche",
        item_name="leche",
        confirmed_by="user-1",
    )
    session.add(mapping)
    session.commit()

    items = [_item("item-first", "Leche"), _item("item-second", "leche")]
    matched, unmatched = match_lines([_unit("LECHE", 1.10)], "Mercadona", items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-first"
    assert len(unmatched) == 0


def test_multi_line_carries_quantity(session):
    items = [_item("item-1", "Yogur natural")]
    line = ParsedLine(
        name="YOGUR NATURAL",
        price_type="MULTI",
        unit_price=0.95,
        quantity=3,
        line_total=2.85,
    )
    matched, unmatched = match_lines([line], "Mercadona", items, session)
    assert matched[0].price_type == "MULTI"
    assert matched[0].unit_price == pytest.approx(0.95)
    assert matched[0].quantity == 3
    assert matched[0].line_total == pytest.approx(2.85)
