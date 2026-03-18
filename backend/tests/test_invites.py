from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ListInvite, ListMember


def _create_list(client):
    return client.post("/lists", json={"name": "Shared"}).json()


def test_invite_flow_accept(
    client: TestClient, other_client: TestClient, other_user, session: Session
):
    lst = _create_list(client)
    # Seed a pending invite for other_user
    invite = ListInvite(list_id=lst["id"], invited_email=other_user.email, invited_by=lst["owner_id"])
    session.add(invite)
    session.commit()
    session.refresh(invite)

    # other_user sees their pending invites
    response = other_client.get("/invites")
    assert response.status_code == 200
    assert any(i["id"] == invite.id for i in response.json())

    # other_user accepts
    response = other_client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 200
    member = session.exec(
        select(ListMember).where(ListMember.list_id == lst["id"], ListMember.user_id == other_user.id)
    ).first()
    assert member is not None
    assert session.get(ListInvite, invite.id) is None


def test_public_invite_preview_no_auth(session: Session, user):
    """GET /invites/{id} is public — no auth required."""
    from app.main import app as _app
    lst_id = None
    # Create a list via session directly so we have an ID
    from app.db.models import List
    import uuid
    from datetime import datetime, timezone
    lst = List(name="Preview List", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    # Use a raw client with NO dependency overrides (unauthenticated)
    from fastapi.testclient import TestClient as RawClient
    with RawClient(_app) as raw:
        # Override only the session dependency so the invite is visible
        from app.db.session import get_session
        _app.dependency_overrides[get_session] = lambda: session
        response = raw.get(f"/invites/{invite.id}")
        _app.dependency_overrides.clear()
    assert response.status_code == 200
    data = response.json()
    assert "list_name" in data
    assert data["list_name"] == "Preview List"


def test_wrong_email_cannot_accept(client: TestClient, other_client: TestClient, session: Session, user):
    lst = _create_list(client)
    # Invite is locked to a different email
    invite = ListInvite(list_id=lst["id"], invited_email="someone_else@example.com", invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    # other_user (bob@example.com) tries to accept — should be 403
    response = other_client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 403


def test_accept_already_member_is_idempotent(client: TestClient, session: Session, user):
    lst = _create_list(client)
    # user is already a member (owner). Create an invite for them.
    invite = ListInvite(list_id=lst["id"], invited_email=user.email, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 200
    assert session.get(ListInvite, invite.id) is None


def test_decline_invite(client: TestClient, session: Session, user):
    lst = _create_list(client)
    invite = ListInvite(list_id=lst["id"], invited_email=user.email, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.delete(f"/invites/{invite.id}")
    assert response.status_code == 204
    assert session.get(ListInvite, invite.id) is None
