import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db.models import User, UserFeature
from app.services.feature_flags import get_enabled_flags, is_enabled


@pytest.fixture(name="engine")
def engine_fixture():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    yield eng
    SQLModel.metadata.drop_all(eng)


@pytest.fixture(name="session")
def session_fixture(engine):
    with Session(engine) as s:
        yield s


@pytest.fixture(name="user")
def user_fixture(session):
    u = User(firebase_uid="uid-ff-test", email="fftest@example.com")
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def test_is_enabled_no_row_falls_back_to_registry_default(session, user):
    assert is_enabled(user.id, "ai_receipt_scanning", session) is False


def test_is_enabled_with_enabled_row(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=True, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert is_enabled(user.id, "ai_receipt_scanning", session) is True


def test_is_enabled_with_disabled_row(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=False, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert is_enabled(user.id, "ai_receipt_scanning", session) is False


def test_is_enabled_unknown_flag_returns_false(session, user):
    assert is_enabled(user.id, "nonexistent_flag", session) is False


def test_get_enabled_flags_no_rows_returns_empty(session, user):
    assert get_enabled_flags(user.id, session) == []


def test_get_enabled_flags_returns_enabled_flag_names(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=True, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert get_enabled_flags(user.id, session) == ["ai_receipt_scanning"]


def test_get_enabled_flags_excludes_disabled_rows(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=False, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert get_enabled_flags(user.id, session) == []
