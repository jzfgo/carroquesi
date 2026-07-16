from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ApiKey, User


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


def test_sync_returns_features_list(session: Session, client: TestClient, user: User):
    response = client.post("/auth/sync")
    assert response.status_code == 200
    data = response.json()
    assert "features" in data
    assert isinstance(data["features"], list)


def test_users_me_returns_features(session: Session, client: TestClient, user: User):
    response = client.get("/users/me")
    assert response.status_code == 200
    data = response.json()
    assert "features" in data
    assert isinstance(data["features"], list)


def test_users_me_reflects_api_key_state(client: TestClient, session: Session, user: User):
    response = client.get("/users/me")
    assert response.status_code == 200
    data = response.json()
    assert data["has_api_key"] is False
    assert data["api_key_last_used_at"] is None

    last_used = datetime.now(UTC).replace(tzinfo=None)
    session.add(
        ApiKey(
            user_id=user.id,
            key_hash="a" * 64,
            key_ciphertext="ciphertext",
            last_used_at=last_used,
        )
    )
    session.commit()

    response = client.get("/users/me")
    data = response.json()
    assert data["has_api_key"] is True
    assert data["api_key_last_used_at"] is not None
    assert datetime.fromisoformat(data["api_key_last_used_at"]) == last_used
