import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import User, UserFeature
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


def test_patch_features_requires_admin(client: TestClient, other_user: User):
    response = client.patch(
        f"/admin/users/{other_user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    assert response.status_code == 403


def test_patch_features_enables_flag(admin_client: TestClient, session: Session, user: User):
    response = admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert "ai_receipt_scanning" in data["features"]

    row = session.exec(
        select(UserFeature).where(
            UserFeature.user_id == user.id,
            UserFeature.feature == "ai_receipt_scanning",
        )
    ).first()
    assert row is not None
    assert row.enabled is True


def test_patch_features_disables_flag(admin_client: TestClient, session: Session, user: User):
    session.add(
        UserFeature(
            user_id=user.id, feature="ai_receipt_scanning", enabled=True, granted_by="admin"
        )
    )
    session.commit()

    response = admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert "ai_receipt_scanning" not in data["features"]


def test_patch_features_upserts_not_duplicates(
    admin_client: TestClient, session: Session, user: User
):
    admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": False},
    )

    rows = session.exec(
        select(UserFeature).where(
            UserFeature.user_id == user.id,
            UserFeature.feature == "ai_receipt_scanning",
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].enabled is False


def test_patch_features_unknown_flag_returns_422(admin_client: TestClient, user: User):
    response = admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "unknown_flag", "enabled": True},
    )
    assert response.status_code == 422


def test_patch_features_unknown_user_returns_404(
    admin_client: TestClient,
):
    response = admin_client.patch(
        "/admin/users/no-such-user/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    assert response.status_code == 404
