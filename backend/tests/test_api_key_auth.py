"""
Tests for the X-Api-Key fallback in get_current_user.

Like test_dev_bypass.py, these build a minimal app that does NOT mock
get_current_user, so the real dependency chain runs end to end.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db.models import ApiKey, User
from app.db.session import get_session
from app.services.api_keys import hash_key


def _make_app(session: Session) -> FastAPI:
    from app.dependencies import CurrentUser

    app = FastAPI()

    @app.get("/whoami")
    def whoami(current_user: CurrentUser):
        return {
            "email": current_user.email,
            "is_admin": getattr(current_user, "is_admin", False),
        }

    def _get_session():
        yield session

    app.dependency_overrides[get_session] = _get_session
    return app


@pytest.fixture(name="auth_session")
def auth_session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="keyed_user")
def keyed_user_fixture(auth_session: Session) -> tuple[User, str]:
    user = User(firebase_uid="uid-carol", display_name="Carol", email="carol@example.com")
    auth_session.add(user)
    auth_session.commit()
    auth_session.refresh(user)

    plaintext = "cqs_test_plaintext_key"
    api_key = ApiKey(user_id=user.id, key_hash=hash_key(plaintext), key_ciphertext="unused")
    auth_session.add(api_key)
    auth_session.commit()
    return user, plaintext


def test_valid_api_key_resolves_user(auth_session, keyed_user):
    user, plaintext = keyed_user
    app = _make_app(auth_session)
    with TestClient(app, raise_server_exceptions=True) as client:
        resp = client.get("/whoami", headers={"X-Api-Key": plaintext})
    assert resp.status_code == 200
    assert resp.json()["email"] == "carol@example.com"


def test_valid_api_key_never_yields_admin(auth_session, keyed_user):
    _, plaintext = keyed_user
    app = _make_app(auth_session)
    with TestClient(app, raise_server_exceptions=True) as client:
        resp = client.get("/whoami", headers={"X-Api-Key": plaintext})
    assert resp.json()["is_admin"] is False


def test_invalid_api_key_returns_401(auth_session, keyed_user):
    app = _make_app(auth_session)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.get("/whoami", headers={"X-Api-Key": "cqs_not_a_real_key"})
    assert resp.status_code == 401


def test_no_credentials_returns_401(auth_session, keyed_user):
    app = _make_app(auth_session)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.get("/whoami")
    assert resp.status_code == 401


def test_valid_api_key_updates_last_used_at(auth_session, keyed_user):
    user, plaintext = keyed_user
    app = _make_app(auth_session)
    with TestClient(app, raise_server_exceptions=True) as client:
        client.get("/whoami", headers={"X-Api-Key": plaintext})

    from sqlmodel import select

    api_key = auth_session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    assert api_key.last_used_at is not None


def test_api_key_with_orphaned_user_id_returns_401(auth_session):
    plaintext = "cqs_orphaned_key"
    orphaned = ApiKey(
        user_id="nonexistent-user-id", key_hash=hash_key(plaintext), key_ciphertext="unused"
    )
    auth_session.add(orphaned)
    auth_session.commit()

    app = _make_app(auth_session)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.get("/whoami", headers={"X-Api-Key": plaintext})
    assert resp.status_code == 401


def test_firebase_bearer_takes_precedence_over_api_key(auth_session, keyed_user):
    _, plaintext = keyed_user
    app = _make_app(auth_session)
    with TestClient(app, raise_server_exceptions=False) as client:
        # A garbage bearer token is present, so the Firebase path is taken
        # and fails — the valid X-Api-Key header must NOT be used as a
        # fallback when an Authorization header was supplied at all.
        resp = client.get(
            "/whoami",
            headers={"Authorization": "Bearer not-a-real-firebase-token", "X-Api-Key": plaintext},
        )
    assert resp.status_code == 401
