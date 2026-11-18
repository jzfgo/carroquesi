from datetime import UTC, datetime

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


def test_blank_token_is_rejected(client):
    for blank in ("", "   ", "\t\n"):
        resp = client.post("/notifications/tokens", json={"token": blank})
        assert resp.status_code == 422, blank


def test_padded_token_is_stored_trimmed(client, session: Session):
    client.post("/notifications/tokens", json={"token": "  tok-padded  "})
    assert session.exec(select(PushToken).where(PushToken.token == "tok-padded")).one()


def test_reregistering_moves_the_registration_timestamp(client, session: Session):
    client.post("/notifications/tokens", json={"token": "tok-abc"})
    row = session.exec(select(PushToken).where(PushToken.token == "tok-abc")).one()
    row.last_registered_at = datetime(2020, 1, 1, tzinfo=UTC)
    session.add(row)
    session.commit()

    client.post("/notifications/tokens", json={"token": "tok-abc"})

    session.expire_all()
    refreshed = session.exec(select(PushToken).where(PushToken.token == "tok-abc")).one()
    assert refreshed.last_registered_at > datetime(2020, 1, 1, tzinfo=UTC)


def test_delete_cannot_remove_another_users_token(client, other_client, session: Session):
    """Deletion is scoped to the caller. Without the user_id filter this returns
    204 and silently unsubscribes someone else's device."""
    client.post("/notifications/tokens", json={"token": "tok-mine"})

    resp = other_client.request("DELETE", "/notifications/tokens", json={"token": "tok-mine"})

    assert resp.status_code == 204
    assert session.exec(select(PushToken).where(PushToken.token == "tok-mine")).one()


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


# --- Gaps found by mutation testing ---


def _add_token(session: Session, id_: str, user_id: str, token: str) -> None:
    session.add(PushToken(id=id_, user_id=user_id, token=token))
    session.commit()


def test_register_claims_only_the_token_it_names(
    client, session: Session, user: User, other_user: User
):
    # The token that is not named comes first, where a looser lookup finds it.
    _add_token(session, "tok-1", other_user.id, "tok-other")
    _add_token(session, "tok-2", other_user.id, "tok-shared")

    client.post("/notifications/tokens", json={"token": "tok-shared"})

    owners = {t.token: t.user_id for t in session.exec(select(PushToken))}
    assert owners == {"tok-other": other_user.id, "tok-shared": user.id}


def test_register_adopts_the_row_a_concurrent_registration_wrote(
    client, session: Session, lose_commit_race, user: User, other_user: User
):
    _add_token(session, "tok-1", other_user.id, "tok-other")
    # Another request registers the same token between our lookup and our commit.
    lose_commit_race(PushToken(id="tok-2", user_id=other_user.id, token="tok-race"))

    assert client.post("/notifications/tokens", json={"token": "tok-race"}).status_code == 204

    owners = {t.token: t.user_id for t in session.exec(select(PushToken))}
    assert owners == {"tok-other": other_user.id, "tok-race": user.id}


def test_delete_removes_only_the_named_token(client, session: Session, user: User):
    _add_token(session, "tok-1", user.id, "tok-keep")
    _add_token(session, "tok-2", user.id, "tok-drop")

    client.request("DELETE", "/notifications/tokens", json={"token": "tok-drop"})

    assert [t.token for t in session.exec(select(PushToken))] == ["tok-keep"]


def test_seen_marks_only_that_list(client, session: Session, user: User):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    other = client.post("/lists", json={"name": "Otra"}).json()

    assert client.post(f"/lists/{lst['id']}/seen").status_code == 204

    seen = {
        m.list_id: m.last_seen_at
        for m in session.exec(select(ListMember).where(ListMember.user_id == user.id))
    }
    assert seen[lst["id"]] is not None
    assert seen[other["id"]] is None
