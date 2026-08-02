from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import ListItem


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _add_item(
    session: Session,
    list_id: str,
    user_id: str,
    name: str,
    purchased_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> ListItem:
    """Insert a ListItem directly, with control over its timestamps."""
    item = ListItem(list_id=list_id, name=name, added_by=user_id, purchased_at=purchased_at)
    if updated_at is not None:
        item.updated_at = updated_at
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def _lookup(client: TestClient, list_id: str, name: str):
    return client.get(f"/lists/{list_id}/items/elsewhere", params={"name": name})


def test_found_with_purchase_date(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    other = client.post("/lists", json={"name": "Beach house"}).json()
    when = _now() - timedelta(days=3)
    _add_item(session, other["id"], user.id, "Pimentón", purchased_at=when)

    resp = _lookup(client, current["id"], "Pimentón")
    assert resp.status_code == 200
    body = resp.json()
    assert body["list_id"] == other["id"]
    assert body["list_name"] == "Beach house"
    assert body["last_purchased_at"] == when.isoformat()


def test_found_never_purchased(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    other = client.post("/lists", json={"name": "Pantry"}).json()
    _add_item(session, other["id"], user.id, "Harina")

    resp = _lookup(client, current["id"], "Harina")
    assert resp.status_code == 200
    body = resp.json()
    assert body["list_id"] == other["id"]
    assert body["last_purchased_at"] is None


def test_picks_most_recent_purchase_across_lists(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    older = client.post("/lists", json={"name": "Older"}).json()
    newer = client.post("/lists", json={"name": "Newer"}).json()
    _add_item(session, older["id"], user.id, "Milk", purchased_at=_now() - timedelta(days=10))
    newest = _now() - timedelta(days=1)
    _add_item(session, newer["id"], user.id, "Milk", purchased_at=newest)

    body = _lookup(client, current["id"], "Milk").json()
    assert body["list_id"] == newer["id"]
    assert body["last_purchased_at"] == newest.isoformat()


def test_purchased_wins_over_unpurchased(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    pending = client.post("/lists", json={"name": "Pending"}).json()
    bought = client.post("/lists", json={"name": "Bought"}).json()
    _add_item(session, pending["id"], user.id, "Eggs", updated_at=_now())
    _add_item(session, bought["id"], user.id, "Eggs", purchased_at=_now() - timedelta(days=30))

    body = _lookup(client, current["id"], "Eggs").json()
    assert body["list_id"] == bought["id"]
    assert body["last_purchased_at"] is not None


def test_picks_most_recently_updated_when_none_purchased(
    client: TestClient, session: Session, user
):
    current = client.post("/lists", json={"name": "Current"}).json()
    stale = client.post("/lists", json={"name": "Stale"}).json()
    fresh = client.post("/lists", json={"name": "Fresh"}).json()
    _add_item(session, stale["id"], user.id, "Bread", updated_at=_now() - timedelta(days=5))
    _add_item(session, fresh["id"], user.id, "Bread", updated_at=_now())

    body = _lookup(client, current["id"], "Bread").json()
    assert body["list_id"] == fresh["id"]
    assert body["last_purchased_at"] is None


def test_matching_ignores_case_and_accents(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    other = client.post("/lists", json={"name": "Other"}).json()
    _add_item(session, other["id"], user.id, "Pimentón")

    assert _lookup(client, current["id"], "pimenton").json()["list_id"] == other["id"]
    assert _lookup(client, current["id"], "PIMENTÓN").json()["list_id"] == other["id"]


def test_matching_collapses_whitespace(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    other = client.post("/lists", json={"name": "Other"}).json()
    _add_item(session, other["id"], user.id, "Olive  oil")

    assert _lookup(client, current["id"], " Olive Oil ").json()["list_id"] == other["id"]


def test_no_fuzzy_matching(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    other = client.post("/lists", json={"name": "Other"}).json()
    _add_item(session, other["id"], user.id, "Pimentón")

    resp = _lookup(client, current["id"], "pimento")
    assert resp.status_code == 200
    assert resp.json() is None


def test_current_list_excluded(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    _add_item(session, current["id"], user.id, "Butter", purchased_at=_now())

    resp = _lookup(client, current["id"], "Butter")
    assert resp.status_code == 200
    assert resp.json() is None


def test_other_users_lists_excluded(
    client: TestClient, other_client: TestClient, session: Session, other_user
):
    current = client.post("/lists", json={"name": "Current"}).json()
    foreign = other_client.post("/lists", json={"name": "Foreign"}).json()
    _add_item(session, foreign["id"], other_user.id, "SecretItem", purchased_at=_now())

    resp = _lookup(client, current["id"], "SecretItem")
    assert resp.status_code == 200
    assert resp.json() is None


def test_non_member_forbidden(client: TestClient, other_client: TestClient):
    foreign = other_client.post("/lists", json={"name": "Foreign"}).json()

    resp = _lookup(client, foreign["id"], "Milk")
    assert resp.status_code == 403


def test_unknown_list_not_found(client: TestClient):
    resp = _lookup(client, "no-such-list", "Milk")
    assert resp.status_code == 404


def test_no_match_returns_null(client: TestClient, session: Session, user):
    current = client.post("/lists", json={"name": "Current"}).json()
    other = client.post("/lists", json={"name": "Other"}).json()
    _add_item(session, other["id"], user.id, "Milk")

    resp = _lookup(client, current["id"], "Nutella")
    assert resp.status_code == 200
    assert resp.json() is None
