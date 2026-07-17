from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import User


def test_default_list_id_resolves_to_most_recently_updated_list(
    client: TestClient, session: Session, user: User
):
    older = client.post("/lists", json={"name": "Older"}).json()
    client.post("/lists", json={"name": "Newer"})
    # Bump updated_at on the list created FIRST, so it's older-by-creation but
    # newer-by-update. If resolution ever regressed to ordering by creation
    # order (or insertion/primary-key order) instead of updated_at, this
    # would resolve to "Newer" and the assertion below would fail.
    client.patch(f"/lists/{older['id']}", json={"name": "Older"})

    response = client.get("/lists/default/items")

    assert response.status_code == 200
    added = client.post("/lists/default/items", json={"name": "milk"}).json()
    assert added["list_id"] == older["id"]


def test_default_list_id_404s_when_user_has_no_lists(client: TestClient):
    response = client.get("/lists/default/items")
    assert response.status_code == 404


def test_default_list_id_never_resolves_to_another_users_list(
    client: TestClient, other_client: TestClient, other_user: User
):
    mine = client.post("/lists", json={"name": "Mine"}).json()

    theirs = other_client.post("/lists", json={"name": "Theirs"}).json()
    # Give the other user's list a later updated_at than mine, to prove
    # cross-user isolation isn't an accident of timing.
    other_client.patch(f"/lists/{theirs['id']}", json={"name": "Theirs"})

    response = client.get("/lists/default/items")

    assert response.status_code == 200
    added = client.post("/lists/default/items", json={"name": "milk"}).json()
    assert added["list_id"] == mine["id"]
