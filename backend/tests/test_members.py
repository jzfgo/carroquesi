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
    members = session.exec(select(ListMember).where(ListMember.list_id == lst["id"])).all()
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
        select(ListMember).where(
            ListMember.list_id == lst["id"], ListMember.user_id == other_user.id
        )
    ).all()
    assert len(members) == 0


def test_member_can_remove_themselves(
    client: TestClient, other_client: TestClient, other_user, session: Session
):
    lst = _create_list(client)
    # Add other_user as member directly (bypasses invite flow — test setup only)
    member = ListMember(list_id=lst["id"], user_id=other_user.id)
    session.add(member)
    session.commit()
    response = other_client.delete(f"/lists/{lst['id']}/members/{other_user.id}")
    assert response.status_code == 204


def test_owner_self_leave_requires_transfer_first(client: TestClient, user):
    lst = _create_list(client)
    response = client.delete(f"/lists/{lst['id']}/members/{user.id}")
    assert response.status_code == 409
    assert response.json()["detail"] == "Transfer ownership before leaving"


def test_member_cannot_remove_owner(
    client: TestClient, other_client: TestClient, other_user, user, session: Session
):
    lst = _create_list(client)
    session.add(ListMember(list_id=lst["id"], user_id=other_user.id))
    session.commit()
    response = other_client.delete(f"/lists/{lst['id']}/members/{user.id}")
    assert response.status_code == 400


def test_invite_existing_member_returns_409(client: TestClient, other_user, session: Session):
    lst = _create_list(client)
    # Add other_user as member directly
    member = ListMember(list_id=lst["id"], user_id=other_user.id)
    session.add(member)
    session.commit()
    response = client.post(f"/lists/{lst['id']}/members", json={"email": other_user.email})
    assert response.status_code == 409


def test_get_members_includes_user_fields(client: TestClient, user):
    lst = _create_list(client)
    response = client.get(f"/lists/{lst['id']}/members")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    member = data[0]
    assert member["display_name"] == "Alice"
    assert member["photo_url"] is None


def test_get_members_display_name_falls_back_to_email_prefix(
    client: TestClient, user, session: Session
):
    """When a user has no display_name, the endpoint returns the email prefix."""
    from sqlmodel import select as sql_select

    from app.db.models import User as UserModel

    db_user = session.exec(sql_select(UserModel).where(UserModel.id == user.id)).first()
    db_user.display_name = None
    session.add(db_user)
    session.commit()

    lst = _create_list(client)
    response = client.get(f"/lists/{lst['id']}/members")
    assert response.status_code == 200
    assert response.json()[0]["display_name"] == "alice"


def _add_member(session: Session, list_id: str, user_id: str) -> None:
    """Test setup only — bypasses the invite flow."""
    session.add(ListMember(list_id=list_id, user_id=user_id))
    session.commit()


def test_transfer_ownership(client: TestClient, other_user, user, session: Session):
    from app.db.models import List

    lst = _create_list(client)
    _add_member(session, lst["id"], other_user.id)
    before = session.get(List, lst["id"]).updated_at

    response = client.put(f"/lists/{lst['id']}/owner", json={"user_id": other_user.id})

    assert response.status_code == 204
    session.expire_all()
    row = session.get(List, lst["id"])
    assert row.owner_id == other_user.id
    # Co-members poll updated_at, so the transfer must bump it.
    assert row.updated_at > before


def test_transfer_keeps_old_owner_membership(
    client: TestClient, other_user, user, session: Session
):
    lst = _create_list(client)
    _add_member(session, lst["id"], other_user.id)

    client.put(f"/lists/{lst['id']}/owner", json={"user_id": other_user.id})

    memberships = session.exec(select(ListMember).where(ListMember.list_id == lst["id"])).all()
    assert {m.user_id for m in memberships} == {user.id, other_user.id}


def test_non_owner_cannot_transfer(
    client: TestClient, other_client: TestClient, other_user, session: Session
):
    lst = _create_list(client)
    _add_member(session, lst["id"], other_user.id)

    response = other_client.put(f"/lists/{lst['id']}/owner", json={"user_id": other_user.id})

    assert response.status_code == 403


def test_transfer_to_non_member_returns_404(client: TestClient, other_user):
    lst = _create_list(client)
    response = client.put(f"/lists/{lst['id']}/owner", json={"user_id": other_user.id})
    assert response.status_code == 404


def test_transfer_to_self_returns_400(client: TestClient, user):
    lst = _create_list(client)
    response = client.put(f"/lists/{lst['id']}/owner", json={"user_id": user.id})
    assert response.status_code == 400


def test_old_owner_can_leave_after_transfer(client: TestClient, other_user, user, session: Session):
    lst = _create_list(client)
    _add_member(session, lst["id"], other_user.id)

    assert (
        client.put(f"/lists/{lst['id']}/owner", json={"user_id": other_user.id}).status_code == 204
    )
    assert client.delete(f"/lists/{lst['id']}/members/{user.id}").status_code == 204

    memberships = session.exec(select(ListMember).where(ListMember.list_id == lst["id"])).all()
    assert {m.user_id for m in memberships} == {other_user.id}


def test_transfer_notifies_after_commit(client: TestClient, other_user, session: Session):
    from unittest.mock import patch

    lst = _create_list(client)
    _add_member(session, lst["id"], other_user.id)

    with patch("app.routers.members.notify_ownership_change") as notify:
        response = client.put(f"/lists/{lst['id']}/owner", json={"user_id": other_user.id})

    assert response.status_code == 204
    notify.assert_called_once()
    assert notify.call_args.args[3] == other_user.id


def test_transfer_succeeds_when_push_raises(client: TestClient, other_user, session: Session):
    from unittest.mock import patch

    lst = _create_list(client)
    _add_member(session, lst["id"], other_user.id)

    with patch("app.routers.members.notify_ownership_change", side_effect=RuntimeError("boom")):
        response = client.put(f"/lists/{lst['id']}/owner", json={"user_id": other_user.id})

    assert response.status_code == 204
