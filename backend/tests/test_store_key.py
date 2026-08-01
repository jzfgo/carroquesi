import json
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.models import ReceiptNameMapping
from app.services.store_key import merge_receipt_name_mapping_keys, store_key

VECTORS_PATH = (
    Path(__file__).parent.parent.parent / "frontend" / "src" / "lib" / "storeKeyVectors.json"
)
VECTORS = json.loads(VECTORS_PATH.read_text())


@pytest.mark.parametrize("vector", VECTORS, ids=[v["input"] or "<empty>" for v in VECTORS])
def test_store_key_matches_shared_vectors(vector):
    """The frontend asserts the same file; either side drifting fails its suite."""
    assert store_key(vector["input"]) == vector["key"]


def test_punctuation_only_names_keep_distinct_keys():
    """The fallback exists so '***' and '??' don't both collapse into ''."""
    assert store_key("***") != store_key("??")


def test_key_is_idempotent():
    for vector in VECTORS:
        assert store_key(vector["key"]) == vector["key"]


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


def _mapping(
    store: str,
    receipt_name: str,
    item_name: str = "Leche",
    use_count: int = 1,
    updated_at: datetime | None = None,
) -> ReceiptNameMapping:
    return ReceiptNameMapping(
        store=store,
        receipt_name=receipt_name,
        item_name=item_name,
        confirmed_by="user-1",
        use_count=use_count,
        updated_at=updated_at or datetime(2026, 1, 1),
    )


def test_merge_collapses_variant_rows(session: Session):
    session.add(_mapping("Ahorra Más", "MANÍ DULCE", item_name="Maní", use_count=3))
    session.add(_mapping("AhorraMás", "mani dulce", item_name="Cacahuete", use_count=1))
    session.commit()

    merge_receipt_name_mapping_keys(session)
    session.commit()

    rows = session.exec(select(ReceiptNameMapping)).all()
    assert len(rows) == 1
    assert rows[0].store == "ahorramas"
    assert rows[0].receipt_name == "mani dulce"
    assert rows[0].use_count == 4
    assert rows[0].item_name == "Maní"  # survivor had the higher use_count


def test_merge_tie_breaks_on_most_recent_update(session: Session):
    session.add(_mapping("Lidl", "pan", item_name="Old", updated_at=datetime(2026, 1, 1)))
    session.add(_mapping("LIDL", "pan", item_name="New", updated_at=datetime(2026, 6, 1)))
    session.commit()

    merge_receipt_name_mapping_keys(session)
    session.commit()

    rows = session.exec(select(ReceiptNameMapping)).all()
    assert len(rows) == 1
    assert rows[0].item_name == "New"


def test_merge_survives_loser_holding_the_target_key(session: Session):
    """A loser can already sit on the exact key pair; the delete must be
    flushed before the survivor is rewritten onto it."""
    session.add(_mapping("mercadona", "pan", item_name="Loser", use_count=1))
    session.add(_mapping("Mercadona", "PAN", item_name="Survivor", use_count=5))
    session.commit()

    merge_receipt_name_mapping_keys(session)
    session.commit()

    rows = session.exec(select(ReceiptNameMapping)).all()
    assert len(rows) == 1
    assert rows[0].store == "mercadona"
    assert rows[0].receipt_name == "pan"
    assert rows[0].item_name == "Survivor"
    assert rows[0].use_count == 6


def test_merge_is_idempotent(session: Session):
    session.add(_mapping("Ahorra Más", "MANÍ DULCE", use_count=2))
    session.add(_mapping("Carrefour", "leche entera"))
    session.commit()

    merge_receipt_name_mapping_keys(session)
    session.commit()
    first = [
        (r.store, r.receipt_name, r.use_count)
        for r in session.exec(select(ReceiptNameMapping)).all()
    ]

    merge_receipt_name_mapping_keys(session)
    session.commit()
    second = [
        (r.store, r.receipt_name, r.use_count)
        for r in session.exec(select(ReceiptNameMapping)).all()
    ]

    assert first == second


def test_merge_normalises_receipt_name_with_matcher_rule(session: Session):
    """receipt_name uses normalise() (keeps punctuation, strips leading qty),
    not store_key() — receipt lines like 'LECHE 1,5%' must stay distinct."""
    session.add(_mapping("Dia", "2 LECHE  1,5%"))
    session.commit()

    merge_receipt_name_mapping_keys(session)
    session.commit()

    row = session.exec(select(ReceiptNameMapping)).one()
    assert row.receipt_name == "leche 1,5%"
