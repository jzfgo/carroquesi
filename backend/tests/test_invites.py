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
    # Create a list via session directly so we have an ID
    from app.db.models import List
    lst = List(name="Preview List", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    # Build a bare app (no lifespan/Firebase) that only mounts the invites router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient as RawClient
    from app.db.session import get_session
    from app.routers import invites as invites_router
    bare_app = FastAPI()
    bare_app.include_router(invites_router.router)
    bare_app.dependency_overrides[get_session] = lambda: session
    with RawClient(bare_app) as raw:
        response = raw.get(f"/invites/{invite.id}")
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


def test_link_invite_accepted_by_any_user(other_client: TestClient, session: Session, user):
    """A link invite (no email) can be accepted by any authenticated user."""
    from app.db.models import List
    lst = List(name="Open List", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    # Seed owner as member (mirrors what POST /lists does via the API)
    owner_member = ListMember(list_id=lst.id, user_id=user.id)
    session.add(owner_member)
    invite = ListInvite(list_id=lst.id, invited_by=user.id)  # no invited_email
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = other_client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 200
    members = session.exec(
        select(ListMember).where(ListMember.list_id == lst.id)
    ).all()
    # owner + other_user = 2 members
    assert len(members) == 2


def test_unrelated_user_cannot_delete_link_invite(other_client: TestClient, session: Session, user):
    """An unrelated user cannot delete a link invite — only the list owner can."""
    from app.db.models import List
    lst = List(name="Locked List", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(list_id=lst.id, invited_by=user.id)  # no invited_email
    session.add(invite)
    session.commit()
    session.refresh(invite)

    # other_user is NOT the owner
    response = other_client.delete(f"/invites/{invite.id}")
    assert response.status_code == 403
