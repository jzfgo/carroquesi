from sqlmodel import Session, select

from app.db.models import ListMember, PushToken, User


def test_register_token_creates_row(client, session: Session, user: User):
    resp = client.post("/notifications/tokens", json={"token": "tok-abc"})
    assert resp.status_code == 204
    row = session.exec(select(PushToken).where(PushToken.token == "tok-abc")).one()
    assert row.user_id == user.id


def test_register_same_token_twice_is_idempotent(client, session: Session):
    client.post("/notifications/tokens", json={"token": "tok-abc"})
    client.post("/notifications/tokens", json={"token": "tok-abc"})
    rows = session.exec(select(PushToken).where(PushToken.token == "tok-abc")).all()
    assert len(rows) == 1


def test_register_reassigns_token_to_new_owner(
    client, other_client, session: Session, other_user: User
):
    """A shared device: the token must follow whoever is signed in now."""
    client.post("/notifications/tokens", json={"token": "tok-shared"})
    other_client.post("/notifications/tokens", json={"token": "tok-shared"})
    row = session.exec(select(PushToken).where(PushToken.token == "tok-shared")).one()
    assert row.user_id == other_user.id


def test_delete_token_removes_row(client, session: Session):
    client.post("/notifications/tokens", json={"token": "tok-abc"})
    resp = client.request("DELETE", "/notifications/tokens", json={"token": "tok-abc"})
    assert resp.status_code == 204
    assert session.exec(select(PushToken).where(PushToken.token == "tok-abc")).first() is None


def test_delete_unknown_token_is_noop(client):
    resp = client.request("DELETE", "/notifications/tokens", json={"token": "nope"})
    assert resp.status_code == 204


def test_seen_sets_watermark_for_caller_only(
    client, other_client, session: Session, user: User, other_user: User
):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    invite = client.post(f"/lists/{lst['id']}/invites", json={}).json()
    other_client.post(f"/invites/{invite['id']}/accept")

    resp = client.post(f"/lists/{lst['id']}/seen")
    assert resp.status_code == 204

    mine = session.exec(
        select(ListMember).where(ListMember.list_id == lst["id"], ListMember.user_id == user.id)
    ).one()
    theirs = session.exec(
        select(ListMember).where(
            ListMember.list_id == lst["id"], ListMember.user_id == other_user.id
        )
    ).one()
    assert mine.last_seen_at is not None
    assert theirs.last_seen_at is None


def test_seen_requires_membership(other_client, client):
    lst = client.post("/lists", json={"name": "Privada"}).json()
    resp = other_client.post(f"/lists/{lst['id']}/seen")
    assert resp.status_code == 403
