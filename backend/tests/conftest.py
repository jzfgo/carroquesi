import os

# Set env vars before any app modules are imported so pydantic-settings picks
# them up and the module-level engine creation in app.db.session uses SQLite.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db.models import User
from app.db.session import get_session
from app.dependencies import get_current_user
from app.main import app


@pytest.fixture(name="engine")
def engine_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session")
def session_fixture(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture(name="user")
def user_fixture(session: Session) -> User:
    user = User(firebase_uid="uid-alice", display_name="Alice", email="alice@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="other_user")
def other_user_fixture(session: Session) -> User:
    user = User(firebase_uid="uid-bob", display_name="Bob", email="bob@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_client(session: Session, user: User) -> TestClient:
    """Return a TestClient wired to a fresh app copy with the given user/session."""
    from app.main import app as _app  # re-import to get the real app
    from fastapi import FastAPI

    # Build a thin wrapper: new app that mounts the same router but has its own
    # dependency_overrides dict, so two clients in the same test don't conflict.
    from fastapi.middleware.cors import CORSMiddleware
    from app.core.config import settings
    from app.routers import admin, auth, barcode, feedback, invites, items, lists, members, prices, receipt, suggestions

    test_app = FastAPI()
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    test_app.include_router(auth.router)
    test_app.include_router(auth.users_router)
    test_app.include_router(admin.router)
    test_app.include_router(lists.router)
    test_app.include_router(members.router)
    test_app.include_router(items.router)
    test_app.include_router(invites.router)
    test_app.include_router(invites.list_invites_router)
    test_app.include_router(suggestions.router)
    test_app.include_router(barcode.router)
    test_app.include_router(prices.router)
    test_app.include_router(receipt.router)
    test_app.include_router(feedback.router)

    def _get_session():
        yield session

    def _get_current_user():
        return user

    test_app.dependency_overrides[get_session] = _get_session
    test_app.dependency_overrides[get_current_user] = _get_current_user
    return TestClient(test_app)


@pytest.fixture(name="client")
def client_fixture(session: Session, user: User):
    client = _make_client(session, user)
    with client:
        yield client


@pytest.fixture(name="other_client")
def other_client_fixture(session: Session, other_user: User):
    client = _make_client(session, other_user)
    with client:
        yield client


@pytest.fixture(name="second_list")
def second_list_fixture(client):
    resp = client.post("/lists", json={"name": "Lista 2"})
    return resp.json()
