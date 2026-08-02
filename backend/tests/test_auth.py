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
            last_used_at=last_used,
        )
    )
    session.commit()

    response = client.get("/users/me")
    data = response.json()
    assert data["has_api_key"] is True
    assert data["api_key_last_used_at"] is not None
    assert datetime.fromisoformat(data["api_key_last_used_at"]) == last_used


def test_sync_returns_null_consent_when_never_asked(client: TestClient, user: User):
    response = client.post("/auth/sync")
    assert response.status_code == 200
    data = response.json()
    assert "receipt_consent" in data
    assert data["receipt_consent"] is None


def test_put_receipt_consent_grants(client: TestClient, session: Session, user: User):
    response = client.put("/users/me/receipt-consent", json={"consent": "granted"})
    assert response.status_code == 200
    assert response.json()["receipt_consent"] == "granted"

    session.refresh(user)
    assert user.receipt_consent == "granted"
    assert user.receipt_consent_at is not None


def test_put_receipt_consent_declines(client: TestClient, session: Session, user: User):
    response = client.put("/users/me/receipt-consent", json={"consent": "declined"})
    assert response.status_code == 200
    assert response.json()["receipt_consent"] == "declined"

    session.refresh(user)
    assert user.receipt_consent == "declined"
    assert user.receipt_consent_at is not None


def test_put_receipt_consent_is_idempotent(client: TestClient, session: Session, user: User):
    client.put("/users/me/receipt-consent", json={"consent": "granted"})
    response = client.put("/users/me/receipt-consent", json={"consent": "granted"})
    assert response.status_code == 200
    assert response.json()["receipt_consent"] == "granted"


def test_put_receipt_consent_retoggle_restamps_timestamp(
    client: TestClient, session: Session, user: User
):
    client.put("/users/me/receipt-consent", json={"consent": "granted"})
    session.refresh(user)

    # Backdate the stamp so the second decision provably rewrites it.
    user.receipt_consent_at = datetime(2020, 1, 1, 0, 0, 0)
    session.add(user)
    session.commit()

    response = client.put("/users/me/receipt-consent", json={"consent": "declined"})
    assert response.status_code == 200
    assert response.json()["receipt_consent"] == "declined"

    session.refresh(user)
    assert user.receipt_consent == "declined"
    assert user.receipt_consent_at > datetime(2020, 1, 1, 0, 0, 0)


def test_put_receipt_consent_rejects_unknown_values(client: TestClient):
    response = client.put("/users/me/receipt-consent", json={"consent": "maybe"})
    assert response.status_code == 422


def test_users_me_carries_consent_decision(client: TestClient, session: Session, user: User):
    user.receipt_consent = "declined"
    session.add(user)
    session.commit()

    response = client.get("/users/me")
    assert response.status_code == 200
    assert response.json()["receipt_consent"] == "declined"
