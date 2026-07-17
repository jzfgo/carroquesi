from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import User


def test_default_list_id_resolves_to_most_recently_updated_list(
    client: TestClient, session: Session, user: User
):
    client.post("/lists", json={"name": "Old"})
    newest = client.post("/lists", json={"name": "New"}).json()
    client.patch(f"/lists/{newest['id']}", json={"name": "New"})  # bump updated_at

    response = client.get("/lists/default/items")

    assert response.status_code == 200
    # confirm it's really scoped to the newest list, not the oldest
    added = client.post("/lists/default/items", json={"name": "milk"}).json()
    assert added["list_id"] == newest["id"]


def test_default_list_id_404s_when_user_has_no_lists(client: TestClient):
    response = client.get("/lists/default/items")
    assert response.status_code == 404
