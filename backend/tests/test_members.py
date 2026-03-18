from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ListMember


def _create_list(client, name="Test List"):
    return client.post("/lists", json={"name": name}).json()


def test_get_members(client: TestClient):
    lst = _create_list(client)
    response = client.get(f"/lists/{lst['id']}/members")
    assert response.status_code == 200
    assert len(response.json()) == 1  # owner is a member


def test_add_member_creates_invite(client: TestClient, other_user, session: Session):
    from app.db.models import ListInvite
    lst = _create_list(client)
    # Even when the email matches an existing user, an invite is created (not direct membership)
    response = client.post(f"/lists/{lst['id']}/members", json={"email": other_user.email})
    assert response.status_code == 202
    invite = session.exec(select(ListInvite).where(ListInvite.list_id == lst["id"])).first()
    assert invite is not None
    assert invite.invited_email == other_user.email
    # No direct membership created
    members = session.exec(
        select(ListMember).where(ListMember.list_id == lst["id"])
    ).all()
    assert len(members) == 1  # only the owner


def test_add_member_unknown_email_creates_invite(client: TestClient, session: Session):
    from app.db.models import ListInvite
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/members", json={"email": "unknown@example.com"})
    assert response.status_code == 202
    invite = session.exec(select(ListInvite).where(ListInvite.list_id == lst["id"])).first()
    assert invite is not None
    assert invite.invited_email == "unknown@example.com"


def test_non_owner_cannot_add_member(client: TestClient, other_client: TestClient, other_user):
    lst = _create_list(client)
    response = other_client.post(f"/lists/{lst['id']}/members", json={"email": "third@example.com"})
    assert response.status_code == 403


def test_remove_member(client: TestClient, other_user, session: Session, user):
    lst = _create_list(client)
    # Add other_user as member directly (bypasses invite flow — test setup only)
    member = ListMember(list_id=lst["id"], user_id=other_user.id)
    session.add(member)
    session.commit()
    response = client.delete(f"/lists/{lst['id']}/members/{other_user.id}")
    assert response.status_code == 204
    members = session.exec(
        select(ListMember).where(ListMember.list_id == lst["id"], ListMember.user_id == other_user.id)
    ).all()
    assert len(members) == 0


def test_member_can_remove_themselves(client: TestClient, other_client: TestClient, other_user, session: Session):
    lst = _create_list(client)
    # Add other_user as member directly (bypasses invite flow — test setup only)
    member = ListMember(list_id=lst["id"], user_id=other_user.id)
    session.add(member)
    session.commit()
    response = other_client.delete(f"/lists/{lst['id']}/members/{other_user.id}")
    assert response.status_code == 204
