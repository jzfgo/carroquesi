from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import ListItem, ReceiptNameMapping, User
from scripts import backfill_pack_formats as pack_backfill

NOW = datetime(2026, 11, 15, 10, 0, tzinfo=UTC)
WRITTEN = datetime(2026, 10, 1, 10, 0, tzinfo=UTC)


def _list_id(client: TestClient) -> str:
    return client.post("/lists", json={"name": "Casa"}).json()["id"]


def _line(session: Session, user: User, list_id: str, name: str, **fields) -> ListItem:
    line = ListItem(list_id=list_id, added_by=user.id, name=name, updated_at=WRITTEN, **fields)
    session.add(line)
    session.commit()
    return line


def _backfill(session: Session) -> pack_backfill.Plan:
    plan = pack_backfill.plan(session)
    pack_backfill.apply(session, plan)
    session.commit()
    return plan


def test_a_dry_run_writes_nothing(client: TestClient, session: Session, user: User):
    line = _line(session, user, _list_id(client), "Agua 6x1,5L")
    plan = pack_backfill.plan(session)
    session.commit()
    session.refresh(line)
    assert [c.name for c in plan.items] == ["Agua"]
    assert line.name == "Agua 6x1,5L"
    assert line.pack is None


def test_a_format_in_the_name_moves_out_of_it(client: TestClient, session: Session, user: User):
    line = _line(session, user, _list_id(client), "Agua 6x1,5L", quantity="1,5 L")
    _backfill(session)
    session.refresh(line)
    assert line.name == "Agua"
    assert line.pack == {"count": 6, "content": 1.5, "unit": "l"}
    assert line.pack_source == "name"
    # The size the name said is said once, by the format.
    assert line.quantity is None
    assert line.updated_at.replace(tzinfo=UTC) == WRITTEN


def test_a_size_in_a_bought_quantity_moves_to_the_format(
    client: TestClient, session: Session, user: User
):
    line = _line(
        session,
        user,
        _list_id(client),
        "Leche",
        purchased_quantity="1,5 L",
        price=1.2,
        purchased_at=NOW,
    )
    _backfill(session)
    session.refresh(line)
    assert line.pack == {"count": 1, "content": 1.5, "unit": "l"}
    assert line.pack_source == "quantity"
    assert line.purchased_quantity is None


def test_a_weighed_or_pending_quantity_stays(client: TestClient, session: Session, user: User):
    list_id = _list_id(client)
    weighed = _line(
        session,
        user,
        list_id,
        "Tomate",
        purchased_quantity="0,5 kg",
        price=2.0,
        price_per="KILOGRAM",
        purchased_at=NOW,
    )
    pending = _line(session, user, list_id, "Pera", quantity="500 g")
    six_packs = _line(session, user, list_id, "Agua", quantity="6x1L", price=3.0, purchased_at=NOW)
    assert _backfill(session).items == []
    for line in (weighed, pending, six_packs):
        session.refresh(line)
        assert line.pack is None


def test_a_change_that_would_move_the_amount_is_skipped(
    client: TestClient, session: Session, user: User
):
    """Clearing the bought size lets the asked «3» count: 0,80 € would
    become 2,40 €. A record's money never moves."""
    list_id = _list_id(client)
    by_name = _line(
        session,
        user,
        list_id,
        "Agua 1,5L",
        quantity="3",
        purchased_quantity="1,5 L",
        price=0.8,
        purchased_at=NOW,
    )
    by_quantity = _line(
        session,
        user,
        list_id,
        "Leche",
        quantity="2",
        purchased_quantity="500 g",
        price=1.0,
        purchased_at=NOW,
    )
    # Unpriced today, priced at ×3 the day someone adds a price.
    unpriced = _line(
        session,
        user,
        list_id,
        "Zumo 1L",
        quantity="3",
        purchased_quantity="1 L",
        purchased_at=NOW,
    )
    plan = _backfill(session)
    assert plan.items == []
    assert {s.item.id for s in plan.skipped} == {by_name.id, by_quantity.id, unpriced.id}
    for line in (by_name, by_quantity, unpriced):
        session.refresh(line)
        assert line.pack is None


def test_a_format_already_there_is_never_replaced(client: TestClient, session: Session, user: User):
    line = _line(
        session,
        user,
        _list_id(client),
        "Agua 1,5L",
        pack_count=6,
        pack_content=1.5,
        pack_content_unit="l",
        pack_source="manual",
    )
    assert _backfill(session).items == []
    session.refresh(line)
    assert line.name == "Agua 1,5L"


def test_two_pending_lines_never_become_one_name(client: TestClient, session: Session, user: User):
    list_id = _list_id(client)
    _line(session, user, list_id, "Agua")
    line = _line(session, user, list_id, "Agua 1,5L")
    plan = _backfill(session)
    assert [s.item.id for s in plan.skipped] == [line.id]
    session.refresh(line)
    assert line.name == "Agua 1,5L"


def test_a_learned_mapping_follows_the_new_name(session: Session, user: User):
    mapping = ReceiptNameMapping(
        store="mercadona",
        receipt_name="agua min 6x1.5",
        item_name="Agua mineral 6x1,5L",
        confirmed_by=user.id,
    )
    session.add(mapping)
    session.commit()
    _backfill(session)
    session.refresh(mapping)
    assert mapping.item_name == "Agua mineral"
