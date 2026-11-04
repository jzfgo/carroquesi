"""
Tests for the dev auth bypass in get_current_user, and the timezone it records.

These tests build a minimal app that does NOT mock get_current_user so the
real dependency runs, letting us exercise all three bypass branches:
  - bypass on + known uid → resolves user
  - bypass on + unknown uid → 401
  - bypass off + header present → header is ignored, normal auth required
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.config import get_settings
from app.db.models import User
from app.db.session import get_session


# A minimal endpoint that returns the resolved user's email, used to confirm
# which user get_current_user returned.
def _make_bypass_app(session: Session) -> FastAPI:
    from app.dependencies import CurrentUser

    bypass_app = FastAPI()

    @bypass_app.get("/whoami")
    def whoami(current_user: CurrentUser):
        return {"email": current_user.email}

    def _get_session():
        yield session

    bypass_app.dependency_overrides[get_session] = _get_session
    return bypass_app


@pytest.fixture(name="bypass_session")
def bypass_session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="seed_user")
def seed_user_fixture(bypass_session: Session) -> User:
    user = User(firebase_uid="seed-alice", display_name="Alice", email="alice@seed.local")
    bypass_session.add(user)
    bypass_session.commit()
    bypass_session.refresh(user)
    return user


def test_dev_bypass_resolves_known_user(bypass_session, seed_user, monkeypatch):
    monkeypatch.setattr(get_settings(), "dev_auth_bypass", True)
    app = _make_bypass_app(bypass_session)
    with TestClient(app, raise_server_exceptions=True) as client:
        resp = client.get(
            "/whoami",
            headers={"Authorization": "Bearer dev-bypass", "X-Dev-User-Id": "seed-alice"},
        )
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@seed.local"


def test_dev_bypass_unknown_uid_returns_401(bypass_session, seed_user, monkeypatch):
    monkeypatch.setattr(get_settings(), "dev_auth_bypass", True)
    app = _make_bypass_app(bypass_session)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.get(
            "/whoami",
            headers={"Authorization": "Bearer dev-bypass", "X-Dev-User-Id": "seed-nobody"},
        )
    assert resp.status_code == 401


def test_dev_bypass_disabled_header_is_ignored(bypass_session, seed_user, monkeypatch):
    monkeypatch.setattr(get_settings(), "dev_auth_bypass", False)
    app = _make_bypass_app(bypass_session)
    with TestClient(app, raise_server_exceptions=False) as client:
        # Header present but bypass is off — should fall through to normal Firebase
        # auth, which fails because "dev-bypass" is not a real token.
        resp = client.get(
            "/whoami",
            headers={"Authorization": "Bearer dev-bypass", "X-Dev-User-Id": "seed-alice"},
        )
    assert resp.status_code == 401


# get_current_user also keeps the zone the browser declares. The bypass is
# the cheapest way to run the real dependency, so the tests live here.


def _whoami(session: Session, monkeypatch, tz: str | None) -> None:
    monkeypatch.setattr(get_settings(), "dev_auth_bypass", True)
    headers = {"X-Dev-User-Id": "seed-alice"}
    if tz is not None:
        headers["X-Client-Timezone"] = tz
    with TestClient(_make_bypass_app(session)) as client:
        assert client.get("/whoami", headers=headers).status_code == 200


def test_auth_records_the_declared_timezone(bypass_session, seed_user, monkeypatch):
    _whoami(bypass_session, monkeypatch, "Europe/Madrid")
    bypass_session.refresh(seed_user)
    assert seed_user.timezone == "Europe/Madrid"


def test_auth_keeps_a_known_zone_over_a_missing_or_bad_one(bypass_session, seed_user, monkeypatch):
    _whoami(bypass_session, monkeypatch, "Europe/Madrid")
    _whoami(bypass_session, monkeypatch, None)
    _whoami(bypass_session, monkeypatch, "Mars/Olympus")
    bypass_session.refresh(seed_user)
    assert seed_user.timezone == "Europe/Madrid"
