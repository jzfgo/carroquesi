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
    matched, unmatched = match_lines(
        [_unit("XXXXXX ZZZZ", 9.99)], "Mercadona", items, session
    )
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
    matched, unmatched = match_lines(
        [_unit("MANI DULCE", 3.15)], "Mercadona", items, session
    )
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
