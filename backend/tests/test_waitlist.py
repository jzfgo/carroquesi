from datetime import UTC

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import User
from app.db.session import get_session
from app.db.waitlist_models import WaitlistSignup
from tests.conftest import _make_client


@pytest.fixture(name="admin_user")
def admin_user_fixture(session: Session) -> User:
    u = User(firebase_uid="uid-admin", display_name="Admin", email="admin@example.com")
    session.add(u)
    session.commit()
    session.refresh(u)
    object.__setattr__(u, "is_admin", True)
    return u


@pytest.fixture(name="admin_client")
def admin_client_fixture(session: Session, admin_user: User):
    client = _make_client(session, admin_user)
    with client:
        yield client


def test_waitlist_signup_stores_clean_email(client: TestClient, session: Session):
    response = client.post("/waitlist", json={"email": "  TEST@example.com  "})
    assert response.status_code == 200
    data = response.json()
    assert data["id"]
    assert data["email"] == "test@example.com"
    assert data["created_at"]

    stored = session.exec(select(WaitlistSignup)).one()
    assert stored.email == "test@example.com"


def test_waitlist_signup_updates_invite_token_on_existing_entry(client: TestClient, session: Session):
    client.post("/waitlist", json={"email": "user@example.com"})
    response = client.post("/waitlist", json={"email": "user@example.com", "invite_token": "inv-abc"})
    assert response.status_code == 200
    assert response.json()["invite_token"] == "inv-abc"

    stored = session.exec(select(WaitlistSignup)).one()
    assert stored.invite_token == "inv-abc"


def test_waitlist_signup_does_not_overwrite_existing_invite_token(client: TestClient, session: Session):
    client.post("/waitlist", json={"email": "user@example.com", "invite_token": "original"})
    response = client.post("/waitlist", json={"email": "user@example.com", "invite_token": "new-token"})
    assert response.status_code == 200
    assert response.json()["invite_token"] == "original"


def test_waitlist_signup_silent_dedup(client: TestClient, session: Session):
    client.post("/waitlist", json={"email": "test@example.com"})
    response = client.post("/waitlist", json={"email": "TEST@example.com"})
    assert response.status_code == 200

    signups = session.exec(select(WaitlistSignup)).all()
    assert len(signups) == 1


def test_waitlist_signup_stores_invite_token(client: TestClient, session: Session):
    response = client.post("/waitlist", json={"email": "user@example.com", "invite_token": "inv-abc123"})
    assert response.status_code == 200
    data = response.json()
    assert data["invite_token"] == "inv-abc123"

    stored = session.exec(select(WaitlistSignup)).one()
    assert stored.invite_token == "inv-abc123"


def test_waitlist_signup_without_invite_token(client: TestClient, session: Session):
    response = client.post("/waitlist", json={"email": "user@example.com"})
    assert response.status_code == 200
    assert response.json()["invite_token"] is None


def test_waitlist_signup_invalid_email(client: TestClient, session: Session):
    response = client.post("/waitlist", json={"email": "not-an-email"})
    assert response.status_code == 422
    assert session.exec(select(WaitlistSignup)).all() == []


def test_list_signups_requires_admin(client: TestClient, admin_client: TestClient, session: Session):
    session.add(WaitlistSignup(email="wait1@example.com"))
    session.add(WaitlistSignup(email="wait2@example.com"))
    session.commit()

    # Non-admin request
    resp1 = client.get("/waitlist/signups")
    assert resp1.status_code == 403

    # Admin request
    resp2 = admin_client.get("/waitlist/signups")
    assert resp2.status_code == 200
    data = resp2.json()
    assert len(data) == 2
    assert data[0]["email"] == "wait2@example.com"  # ordered desc


def test_get_current_user_gate_blocked(session: Session, monkeypatch):
    from app.dependencies import CurrentUser

    # Enable waitlist
    monkeypatch.setattr("app.dependencies.settings.waitlist_enabled", True)

    # Build a test app that runs the real dependency
    gate_app = FastAPI()

    @gate_app.get("/test-gate")
    def test_gate(current_user: CurrentUser):
        return {"id": current_user.id}

    def _get_session():
        yield session

    gate_app.dependency_overrides[get_session] = _get_session

    # Mock Firebase verification to return a new user
    monkeypatch.setattr(
        "app.dependencies.verify_id_token",
        lambda token: {"uid": "new-uid-123", "email": "new@example.com", "name": "New User"},
    )

    with TestClient(gate_app, raise_server_exceptions=False) as client:
        resp = client.get("/test-gate", headers={"Authorization": "Bearer some-token"})

    assert resp.status_code == 403
    assert resp.json()["detail"] == "waitlist"


def test_get_current_user_gate_allowed_for_existing(session: Session, monkeypatch):
    from app.dependencies import CurrentUser

    # Enable waitlist
    monkeypatch.setattr("app.dependencies.settings.waitlist_enabled", True)

    # Seed an existing user
    existing_user = User(firebase_uid="existing-uid", display_name="Existing", email="existing@example.com")
    session.add(existing_user)
    session.commit()
    session.refresh(existing_user)

    gate_app = FastAPI()

    @gate_app.get("/test-gate")
    def test_gate(current_user: CurrentUser):
        return {"id": current_user.id}

    def _get_session():
        yield session

    gate_app.dependency_overrides[get_session] = _get_session

    # Mock Firebase verification to return the existing user's UID
    monkeypatch.setattr(
        "app.dependencies.verify_id_token",
        lambda token: {"uid": "existing-uid", "email": "existing@example.com", "name": "Existing"},
    )

    with TestClient(gate_app, raise_server_exceptions=False) as client:
        resp = client.get("/test-gate", headers={"Authorization": "Bearer some-token"})

    assert resp.status_code == 200
    assert resp.json()["id"] == existing_user.id


def test_get_current_user_gate_allowed_for_new_admin(session: Session, monkeypatch):
    from app.dependencies import CurrentUser

    # Enable waitlist
    monkeypatch.setattr("app.dependencies.settings.waitlist_enabled", True)

    # Do NOT seed user in DB. We test if a new user with is_admin claim is allowed.
    gate_app = FastAPI()

    @gate_app.get("/test-gate")
    def test_gate(current_user: CurrentUser):
        return {"id": current_user.id, "is_admin": getattr(current_user, "is_admin", False)}

    def _get_session():
        yield session

    gate_app.dependency_overrides[get_session] = _get_session

    # Mock Firebase verification to return user with is_admin = True
    monkeypatch.setattr(
        "app.dependencies.verify_id_token",
        lambda token: {"uid": "new-admin-uid", "email": "admin@example.com", "name": "New Admin", "is_admin": True},
    )

    with TestClient(gate_app, raise_server_exceptions=False) as client:
        resp = client.get("/test-gate", headers={"Authorization": "Bearer some-token"})

    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True


def test_get_current_user_gate_allowed_for_approved_waitlist_user(session: Session, monkeypatch):
    from datetime import datetime

    from app.dependencies import CurrentUser

    # Enable waitlist
    monkeypatch.setattr("app.dependencies.settings.waitlist_enabled", True)

    # Seed an approved waitlist signup
    signup = WaitlistSignup(email="approved-waitlist@example.com", allowed_at=datetime.now(UTC).replace(tzinfo=None))
    session.add(signup)
    session.commit()

    # Do NOT seed user in DB.
    gate_app = FastAPI()

    @gate_app.get("/test-gate")
    def test_gate(current_user: CurrentUser):
        return {"id": current_user.id, "email": current_user.email}

    def _get_session():
        yield session

    gate_app.dependency_overrides[get_session] = _get_session

    # Mock Firebase verification
    monkeypatch.setattr(
        "app.dependencies.verify_id_token",
        lambda token: {"uid": "new-approved-uid", "email": "approved-waitlist@example.com", "name": "Approved User"},
    )

    with TestClient(gate_app, raise_server_exceptions=False) as client:
        resp = client.get("/test-gate", headers={"Authorization": "Bearer some-token"})

    assert resp.status_code == 200
    assert resp.json()["email"] == "approved-waitlist@example.com"


def test_get_current_user_gate_blocked_for_unapproved_waitlist_user(session: Session, monkeypatch):
    from app.dependencies import CurrentUser

    # Enable waitlist
    monkeypatch.setattr("app.dependencies.settings.waitlist_enabled", True)

    # Seed an unapproved waitlist signup
    signup = WaitlistSignup(email="unapproved-waitlist@example.com", allowed_at=None)
    session.add(signup)
    session.commit()

    # Do NOT seed user in DB.
    gate_app = FastAPI()

    @gate_app.get("/test-gate")
    def test_gate(current_user: CurrentUser):
        return {"id": current_user.id}

    def _get_session():
        yield session

    gate_app.dependency_overrides[get_session] = _get_session

    # Mock Firebase verification
    monkeypatch.setattr(
        "app.dependencies.verify_id_token",
        lambda token: {"uid": "new-unapproved-uid", "email": "unapproved-waitlist@example.com", "name": "Unapproved User"},
    )

    with TestClient(gate_app, raise_server_exceptions=False) as client:
        resp = client.get("/test-gate", headers={"Authorization": "Bearer some-token"})

    assert resp.status_code == 403
    assert resp.json()["detail"] == "waitlist"

