from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import FeedbackSubmission, User


def test_create_feedback_persists_for_current_user(
    client: TestClient,
    session: Session,
    user: User,
):
    response = client.post(
        "/feedback",
        json={"message": "The receipt flow is confusing", "email": "me@example.com"},
        headers={"user-agent": "pytest-browser"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"]
    assert data["created_at"]

    stored = session.exec(select(FeedbackSubmission)).one()
    assert stored.user_id == user.id
    assert stored.message == "The receipt flow is confusing"
    assert stored.email == "me@example.com"
    assert stored.source == "manual"
    assert stored.user_agent == "pytest-browser"


def test_create_feedback_trims_message_and_blank_email(
    client: TestClient,
    session: Session,
    user: User,
):
    response = client.post(
        "/feedback",
        json={"message": "  Great work  ", "email": "   "},
    )

    assert response.status_code == 200
    stored = session.exec(select(FeedbackSubmission)).one()
    assert stored.user_id == user.id
    assert stored.message == "Great work"
    assert stored.email is None


def test_create_feedback_rejects_blank_message(
    client: TestClient,
    session: Session,
):
    response = client.post("/feedback", json={"message": "   "})

    assert response.status_code == 422
    assert session.exec(select(FeedbackSubmission)).all() == []
