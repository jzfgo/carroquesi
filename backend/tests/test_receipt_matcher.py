import pytest
from unittest.mock import patch, MagicMock
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app.services.receipt_matcher import normalise, match_lines
from app.services.receipt_parser import ParsedLine, ParsedReceipt
from app.db.models import ListItem, ReceiptNameMapping


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


def _item(item_id: str, name: str) -> ListItem:
    return ListItem(
        id=item_id,
        list_id="list-1",
        name=name,
        added_by="user-1",
    )


def test_normalise_lowercases():
    assert normalise("BEBIDA ALMENDRAS") == "bebida almendras"


def test_normalise_strips_accents():
    assert normalise("Bebída") == "bebida"


def test_normalise_strips_leading_quantity():
    assert normalise("2 BOLSA PLASTICO") == "bolsa plastico"


def test_normalise_collapses_whitespace():
    assert normalise("  pan   de  molde  ") == "pan de molde"


def test_match_via_fuzzy(session):
    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="BEBIDA ALMENDRAS 0%", price=1.15)],
    )
    items = [_item("item-1", "Bebida de almendra 0% azúcares")]
    matched, unmatched = match_lines(parsed, items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"
    assert matched[0].price == pytest.approx(1.15)
    assert len(unmatched) == 0


def test_unmatched_when_score_too_low(session):
    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="XXXXXX ZZZZ", price=9.99)],
    )
    items = [_item("item-1", "Bebida de almendra")]
    matched, unmatched = match_lines(parsed, items, session)
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

    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="MANI DULCE", price=3.15)],
    )
    items = [
        _item("item-1", "Maní dulce"),
        _item("item-2", "Frutos secos mix"),
    ]
    matched, unmatched = match_lines(parsed, items, session)
    assert len(matched) == 1
    assert matched[0].item_id == "item-1"
    assert matched[0].item_name == "Maní dulce"


def test_weight_item_price_per_preserved(session):
    parsed = ParsedReceipt(
        store="Mercadona",
        receipt_date=None,
        receipt_total=None,
        lines=[ParsedLine(name="BACON LONCHAS", price=2.30, price_per="KILOGRAM")],
    )
    items = [_item("item-1", "Bacon lonchas")]
    matched, unmatched = match_lines(parsed, items, session)
    assert matched[0].price_per == "KILOGRAM"
    assert matched[0].price == pytest.approx(2.30)
