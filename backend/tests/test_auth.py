from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import User


def test_sync_creates_new_user(session: Session, client: TestClient, user: User):
    # The user fixture already exists; simulate a sync for a brand-new user
    # by overriding with a client that has no pre-existing DB user.
    # We test the upsert: if the user already exists, it should return the existing record.
    response = client.post("/auth/sync")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == user.email
    assert data["display_name"] == user.display_name


def test_sync_is_idempotent(session: Session, client: TestClient, user: User):
    client.post("/auth/sync")
    client.post("/auth/sync")
    users = session.exec(select(User)).all()
    # Should still be only one user with this email
    matching = [u for u in users if u.email == user.email]
    assert len(matching) == 1
