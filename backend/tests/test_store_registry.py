from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, ListItem, ListStore
from app.services.store_registry import backfill_list_stores, ensure_stores


def _create_list(client: TestClient) -> dict:
    return client.post("/lists", json={"name": "Test List"}).json()


def test_ensure_stores_registers_first_typed_form(session: Session, user):
    lst = List(id="l1", name="L", owner_id=user.id)
    session.add(lst)
    session.commit()

    ensure_stores(session, "l1", ["Ahorra Más", "Lidl"])
    session.commit()

    rows = session.exec(select(ListStore).order_by(ListStore.display_name)).all()
    assert [(r.store_key, r.display_name) for r in rows] == [
        ("ahorramas", "Ahorra Más"),
        ("lidl", "Lidl"),
    ]


def test_ensure_stores_never_overwrites_an_existing_label(session: Session, user):
    lst = List(id="l1", name="L", owner_id=user.id)
    session.add(lst)
    session.add(ListStore(list_id="l1", store_key="ahorramas", display_name="Ahorramas"))
    session.commit()

    ensure_stores(session, "l1", ["AHORRA MAS"])
    session.commit()

    rows = session.exec(select(ListStore)).all()
    assert len(rows) == 1
    assert rows[0].display_name == "Ahorramas"


def test_ensure_stores_ignores_blank_names(session: Session, user):
    lst = List(id="l1", name="L", owner_id=user.id)
    session.add(lst)
    session.commit()

    ensure_stores(session, "l1", ["", "   "])
    session.commit()

    assert session.exec(select(ListStore)).all() == []


def test_item_create_registers_stores(client: TestClient, session: Session):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Pan", "stores": ["Ahorra Más"]})

    rows = session.exec(select(ListStore).where(ListStore.list_id == lst["id"])).all()
    assert [(r.store_key, r.display_name) for r in rows] == [("ahorramas", "Ahorra Más")]


def test_item_update_registers_new_stores(client: TestClient, session: Session):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"stores": ["Lidl"]})

    rows = session.exec(select(ListStore).where(ListStore.list_id == lst["id"])).all()
    assert [(r.store_key, r.display_name) for r in rows] == [("lidl", "Lidl")]


def test_price_write_registers_store(client: TestClient, session: Session):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Pan"}).json()
    client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.25, "price_per": None, "store": "Carrefour Express"},
    )

    rows = session.exec(select(ListStore).where(ListStore.list_id == lst["id"])).all()
    assert [(r.store_key, r.display_name) for r in rows] == [
        ("carrefourexpress", "Carrefour Express")
    ]


def test_get_stores_lists_registry(client: TestClient, session: Session):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Pan", "stores": ["Lidl", "Día"]})

    response = client.get(f"/lists/{lst['id']}/stores")
    assert response.status_code == 200
    assert response.json() == [
        {"store_key": "dia", "display_name": "Día"},
        {"store_key": "lidl", "display_name": "Lidl"},
    ]


def test_rename_store_updates_label_and_bumps_list(client: TestClient, session: Session):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Pan", "stores": ["ahorra mas"]})
    before = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]

    response = client.patch(
        f"/lists/{lst['id']}/stores/ahorramas",
        json={"display_name": "Ahorramas"},
    )
    assert response.status_code == 200
    assert response.json() == {"store_key": "ahorramas", "display_name": "Ahorramas"}

    after = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]
    assert after > before


def test_rename_unknown_store_404s(client: TestClient):
    lst = _create_list(client)
    response = client.patch(
        f"/lists/{lst['id']}/stores/nope",
        json={"display_name": "X"},
    )
    assert response.status_code == 404


def test_backfill_picks_most_frequent_variant(session: Session, user):
    lst = List(id="l1", name="L", owner_id=user.id)
    session.add(lst)
    session.add_all(
        [
            ListItem(
                id=f"i{n}",
                list_id="l1",
                name=f"Item {n}",
                added_by=user.id,
                stores=stores,
                price_store=price_store,
                created_at=datetime(2026, 1, 1, 0, n),
            )
            for n, (stores, price_store) in enumerate(
                [
                    (["Ahorra Más"], None),
                    (["Ahorramas"], "Ahorramas"),
                    ([], "Ahorramas"),
                    (["Lidl"], None),
                ]
            )
        ]
    )
    session.commit()

    backfill_list_stores(session)
    session.commit()

    rows = session.exec(select(ListStore).order_by(ListStore.store_key)).all()
    assert [(r.store_key, r.display_name) for r in rows] == [
        ("ahorramas", "Ahorramas"),  # 3 occurrences vs 1
        ("lidl", "Lidl"),
    ]


def test_backfill_tie_breaks_on_first_seen(session: Session, user):
    lst = List(id="l1", name="L", owner_id=user.id)
    session.add(lst)
    session.add_all(
        [
            ListItem(
                id="i1",
                list_id="l1",
                name="A",
                added_by=user.id,
                stores=["Ahorra Más"],
                created_at=datetime(2026, 1, 1),
            ),
            ListItem(
                id="i2",
                list_id="l1",
                name="B",
                added_by=user.id,
                stores=["AHORRAMAS"],
                created_at=datetime(2026, 1, 2),
            ),
        ]
    )
    session.commit()

    backfill_list_stores(session)
    session.commit()

    row = session.exec(select(ListStore)).one()
    assert row.display_name == "Ahorra Más"


def test_backfill_skips_lists_with_existing_entries(session: Session, user):
    lst = List(id="l1", name="L", owner_id=user.id)
    session.add(lst)
    session.add(ListStore(list_id="l1", store_key="lidl", display_name="LIDL renamed"))
    session.add(ListItem(id="i1", list_id="l1", name="A", added_by=user.id, stores=["Lidl"]))
    session.commit()

    backfill_list_stores(session)
    session.commit()

    row = session.exec(select(ListStore)).one()
    assert row.display_name == "LIDL renamed"


def test_backfill_scopes_keys_per_list(session: Session, user):
    session.add_all(
        [
            List(id="l1", name="L1", owner_id=user.id),
            List(id="l2", name="L2", owner_id=user.id),
            ListItem(id="i1", list_id="l1", name="A", added_by=user.id, stores=["Lidl"]),
            ListItem(id="i2", list_id="l2", name="B", added_by=user.id, stores=["lidl"]),
        ]
    )
    session.commit()

    backfill_list_stores(session)
    session.commit()

    rows = session.exec(select(ListStore).order_by(ListStore.list_id)).all()
    assert [(r.list_id, r.display_name) for r in rows] == [("l1", "Lidl"), ("l2", "lidl")]
