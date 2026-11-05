"""The owner's monthly-report switch: the in-app side of the opt-out row.

The email's unsubscribe link and this switch write the same row, so turning
the report back on here undoes an unsubscribe.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import List, ListMember, User
from app.services.report_opt_out import is_opted_out, opt_out


def _make_list(client: TestClient) -> str:
    return client.post("/lists", json={"name": "Casa"}).json()["id"]


def test_the_report_starts_on(client: TestClient):
    list_id = _make_list(client)

    assert client.get(f"/lists/{list_id}/prefs/report").json() == {"enabled": True}


def test_turning_it_off_and_on_again(client: TestClient, session: Session, user: User):
    list_id = _make_list(client)

    assert client.put(f"/lists/{list_id}/prefs/report", json={"enabled": False}).status_code == 204
    assert is_opted_out(session, user.id, list_id)
    assert client.get(f"/lists/{list_id}/prefs/report").json() == {"enabled": False}

    assert client.put(f"/lists/{list_id}/prefs/report", json={"enabled": True}).status_code == 204
    assert not is_opted_out(session, user.id, list_id)


def test_the_switch_undoes_an_unsubscribe(client: TestClient, session: Session, user: User):
    list_id = _make_list(client)
    opt_out(session, user.id, list_id)

    client.put(f"/lists/{list_id}/prefs/report", json={"enabled": True})

    assert client.get(f"/lists/{list_id}/prefs/report").json() == {"enabled": True}


def test_repeating_a_write_changes_nothing(client: TestClient, session: Session, user: User):
    list_id = _make_list(client)

    for _ in range(2):
        assert (
            client.put(f"/lists/{list_id}/prefs/report", json={"enabled": False}).status_code == 204
        )
    for _ in range(2):
        assert (
            client.put(f"/lists/{list_id}/prefs/report", json={"enabled": True}).status_code == 204
        )
    assert not is_opted_out(session, user.id, list_id)


def test_the_switch_does_not_bump_the_list(client: TestClient, session: Session):
    list_id = _make_list(client)
    before = session.get_one(List, list_id).updated_at

    client.put(f"/lists/{list_id}/prefs/report", json={"enabled": False})

    session.expire_all()
    assert session.get_one(List, list_id).updated_at == before


def test_a_member_who_is_not_the_owner_has_no_switch(
    client: TestClient, other_client: TestClient, session: Session, other_user: User
):
    list_id = _make_list(client)
    session.add(ListMember(list_id=list_id, user_id=other_user.id))
    session.commit()

    assert other_client.get(f"/lists/{list_id}/prefs/report").status_code == 403
    put = other_client.put(f"/lists/{list_id}/prefs/report", json={"enabled": False})
    assert put.status_code == 403
    assert not is_opted_out(session, other_user.id, list_id)


def test_an_unknown_list_is_a_404(client: TestClient):
    assert client.get("/lists/nope/prefs/report").status_code == 404
    assert client.put("/lists/nope/prefs/report", json={"enabled": True}).status_code == 404
