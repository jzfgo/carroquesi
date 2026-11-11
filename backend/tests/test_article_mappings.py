from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.chains.registry import decode_label, profile_for
from app.db.models import ChainArticleMapping, User
from app.services.article_mappings import remember_article

NOW = datetime(2026, 11, 11, 10, 0, tzinfo=UTC)


def _list_id(client: TestClient, name: str = "Casa") -> str:
    return client.post("/lists", json={"name": name}).json()["id"]


def _remember(
    session: Session,
    user: User,
    list_id: str,
    *,
    store: str | None = "MERCADONA",
    item_name: str = "Sandía",
    item_brand: str | None = None,
) -> None:
    remember_article(
        session,
        list_id=list_id,
        store=store,
        article="03505",
        item_name=item_name,
        item_brand=item_brand,
        user_id=user.id,
        now=NOW,
    )


def _rows(session: Session) -> list[ChainArticleMapping]:
    return list(session.exec(select(ChainArticleMapping)).all())


def test_remembers_an_article_under_the_chain_key(client, session: Session, user: User):
    list_id = _list_id(client)
    _remember(session, user, list_id)
    session.commit()
    [row] = _rows(session)
    assert row.chain == "mercadona"
    assert row.article == "03505"
    assert row.item_name == "Sandía"
    assert row.list_id == list_id
    assert row.confirmed_by == user.id
    assert row.use_count == 1


def test_a_second_save_updates_the_name_and_counts(client, session: Session, user: User):
    list_id = _list_id(client)
    _remember(session, user, list_id)
    session.commit()
    _remember(session, user, list_id, item_name="Sandía partida", item_brand="Hacendado")
    session.commit()
    [row] = _rows(session)
    assert row.item_name == "Sandía partida"
    assert row.item_brand == "Hacendado"
    assert row.use_count == 2


def test_the_same_article_twice_in_one_session(client, session: Session, user: User):
    list_id = _list_id(client)
    _remember(session, user, list_id)
    _remember(session, user, list_id)
    session.commit()
    [row] = _rows(session)
    assert row.use_count == 2


def test_a_store_no_chain_claims_writes_nothing(client, session: Session, user: User):
    _remember(session, user, _list_id(client), store="Frutería Paco")
    session.commit()
    assert _rows(session) == []


def test_no_store_writes_nothing(client, session: Session, user: User):
    _remember(session, user, _list_id(client), store=None)
    session.commit()
    assert _rows(session) == []


def test_each_list_keeps_its_own_name(client, session: Session, user: User):
    first, second = _list_id(client, "Casa"), _list_id(client, "Oficina")
    _remember(session, user, first, item_name="Sandía")
    _remember(session, user, second, item_name="Melón de agua")
    session.commit()
    names = {row.list_id: row.item_name for row in _rows(session)}
    assert names == {first: "Sandía", second: "Melón de agua"}


def test_deleting_a_list_deletes_its_article_mappings(client, session: Session, engine, user: User):
    # SQLite skips foreign key checks unless asked. Postgres always runs them.
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    list_id = _list_id(client)
    _remember(session, user, list_id)
    session.commit()

    assert client.delete(f"/lists/{list_id}").status_code == 204
    assert _rows(session) == []


def test_a_decoded_label_finds_its_row_by_the_chain_key(client, session: Session, user: User):
    list_id = _list_id(client)
    _remember(session, user, list_id, store="Mercadona")
    session.commit()
    label = decode_label("230035050320600155004972")
    assert label is not None
    [row] = _rows(session)
    assert (profile_for(label.chain).key, label.article) == (row.chain, row.article)
