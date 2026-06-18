from datetime import UTC, datetime

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


def test_create_open_invite(client, session, user):
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    invite = session.get(ListInvite, data["id"])
    assert invite is not None
    assert invite.invited_email is None


def test_non_member_cannot_create_open_invite(other_client, session, user):
    from app.db.models import List
    lst = List(name="Private", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    response = other_client.post(f"/lists/{lst.id}/invites")
    assert response.status_code == 403


def test_list_full_blocks_invite_creation(client, session, user):
    from app.db.models import List
    from app.db.models import User as DBUser
    lst = List(name="Full", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    # Add owner + 4 more = 5 members total
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    for i in range(4):
        extra = DBUser(
            firebase_uid=f"uid-full-{i}",
            display_name=f"Extra {i}",
            email=f"full{i}@example.com",
        )
        session.add(extra)
        session.commit()
        session.refresh(extra)
        session.add(ListMember(list_id=lst.id, user_id=extra.id))
    session.commit()
    response = client.post(f"/lists/{lst.id}/invites")
    assert response.status_code == 409


def test_expired_invites_cleaned_up_on_create(client, session, user):
    from datetime import timedelta
    lst = _create_list(client)
    old = ListInvite(
        list_id=lst["id"],
        invited_by=user.id,
        created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=25),
    )
    session.add(old)
    session.commit()
    session.refresh(old)
    old_id = old.id
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 201
    assert session.get(ListInvite, old_id) is None


def test_open_invite_limit_returns_429(client, session, user):
    lst = _create_list(client)
    for _ in range(5):
        session.add(ListInvite(list_id=lst["id"], invited_by=user.id))
    session.commit()
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 429


def test_expired_invites_do_not_count_toward_limit(client, session, user):
    from datetime import timedelta
    lst = _create_list(client)
    for _ in range(5):
        inv = ListInvite(
            list_id=lst["id"],
            invited_by=user.id,
            created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=25),
        )
        session.add(inv)
    session.commit()
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 201


def test_accept_invite_blocked_when_list_full(other_client, session, user):
    from app.db.models import List
    from app.db.models import User as DBUser
    lst = List(name="Packed", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    for i in range(4):
        extra = DBUser(
            firebase_uid=f"uid-packed-{i}",
            display_name=f"P{i}",
            email=f"packed{i}@example.com",
        )
        session.add(extra)
        session.commit()
        session.refresh(extra)
        session.add(ListMember(list_id=lst.id, user_id=extra.id))
    session.commit()
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)
    response = other_client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 409


def test_get_invite_preview_returns_410_when_expired(session: Session, user):
    from datetime import timedelta

    from fastapi import FastAPI
    from fastapi.testclient import TestClient as RawClient

    from app.db.models import List
    from app.db.session import get_session
    from app.routers import invites as invites_router

    lst = List(name="Old List", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(
        list_id=lst.id,
        invited_by=user.id,
        created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=25),
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)

    bare_app = FastAPI()
    bare_app.include_router(invites_router.router)
    bare_app.dependency_overrides[get_session] = lambda: session
    with RawClient(bare_app) as raw:
        response = raw.get(f"/invites/{invite.id}")
    assert response.status_code == 410


def test_accept_invite_returns_410_when_expired(client: TestClient, session: Session, user):
    from datetime import timedelta

    from app.db.models import List

    lst = List(name="Old List 2", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(
        list_id=lst.id,
        invited_by=user.id,
        created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=25),
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 410


def test_invite_preview_includes_emoji(client: TestClient, session: Session, user):
    from app.db.models import List, ListInvite, ListMember
    lst = List(name="Frutas", emoji="🍎", owner_id=user.id)
    session.add(lst)
    session.flush()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.get(f"/invites/{invite.id}")
    assert response.status_code == 200
    assert response.json()["list_emoji"] == "🍎"


def test_invite_preview_list_emoji_null_when_not_set(client: TestClient, session: Session, user):
    from app.db.models import List, ListInvite, ListMember
    lst = List(name="Sin emoji", emoji=None, owner_id=user.id)
    session.add(lst)
    session.flush()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.get(f"/invites/{invite.id}")
    assert response.status_code == 200
    assert response.json()["list_emoji"] is None
