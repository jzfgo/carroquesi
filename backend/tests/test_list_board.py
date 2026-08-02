"""Per-user per-list board: lazy assignment, isolation, the race, cleanup.

The board is personal presentation state (redesign rule 20): every member of
a shared list gets their own rotation, nobody's write reaches anybody else,
and a board write must never bump lists.updated_at — a personal pref must
not trigger co-members' polls.
"""

from typing import get_args

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import List, ListMember, User, UserListPref
from app.schemas.lists import Board
from app.services.list_board import BOARDS, ensure_board


def _prefs(session: Session, user_id: str) -> list[UserListPref]:
    return list(session.exec(select(UserListPref).where(UserListPref.user_id == user_id)).all())


def _make_list(client: TestClient, name: str = "Casa") -> dict:
    return client.post("/lists", json={"name": name}).json()


def _join(session: Session, list_id: str, user: User) -> None:
    session.add(ListMember(list_id=list_id, user_id=user.id))
    session.commit()


def test_palette_matches_the_request_schema():
    """BOARDS (assignment order) and Board (API validation) encode one palette.

    Two encodings of one rule drift apart silently; this pins them together.
    """
    assert get_args(Board) == BOARDS


def test_single_get_assigns_the_first_board(client: TestClient, session: Session, user: User):
    lst = _make_list(client)

    read = client.get(f"/lists/{lst['id']}").json()

    assert read["board"] == BOARDS[0]
    prefs = _prefs(session, user.id)
    assert len(prefs) == 1
    assert prefs[0].list_id == lst["id"]
    assert prefs[0].board == BOARDS[0]


def test_assignment_is_stable_across_reads(client: TestClient, session: Session, user: User):
    lst = _make_list(client)

    first = client.get(f"/lists/{lst['id']}").json()["board"]
    second = client.get(f"/lists/{lst['id']}").json()["board"]

    assert first == second
    assert len(_prefs(session, user.id)) == 1


def test_rotation_walks_the_palette_then_wraps(client: TestClient):
    """Seven lists: the first six each get a distinct board in palette order,
    the seventh wraps back to the start."""
    boards = []
    for i in range(7):
        lst = _make_list(client, name=f"Lista {i}")
        boards.append(client.get(f"/lists/{lst['id']}").json()["board"])

    assert tuple(boards) == BOARDS + (BOARDS[0],)


def test_a_freed_board_is_reused_first(client: TestClient):
    """Deleting a list frees its board; the next assignment takes the first
    unused board in palette order, not the next in sequence."""
    lists = [_make_list(client, name=f"Lista {i}") for i in range(4)]
    for lst in lists:
        client.get(f"/lists/{lst['id']}")
    freed = client.get(f"/lists/{lists[1]['id']}").json()["board"]

    assert client.delete(f"/lists/{lists[1]['id']}").status_code == 204

    fresh = _make_list(client, name="Nueva")
    assert client.get(f"/lists/{fresh['id']}").json()["board"] == freed == BOARDS[1]


def test_create_does_not_assign(client: TestClient, session: Session, user: User):
    created = client.post("/lists", json={"name": "Casa"}).json()

    assert created["board"] is None
    assert _prefs(session, user.id) == []


def test_panel_get_does_not_assign(client: TestClient, session: Session, user: User):
    _make_list(client)

    panel = client.get("/lists").json()

    assert [lst["board"] for lst in panel] == [None]
    assert _prefs(session, user.id) == []


def test_rename_carries_the_pref_through_without_assigning(
    client: TestClient, session: Session, user: User
):
    lst = _make_list(client)

    renamed = client.patch(f"/lists/{lst['id']}", json={"name": "Compra"}).json()
    assert renamed["board"] is None
    assert _prefs(session, user.id) == []

    assigned = client.get(f"/lists/{lst['id']}").json()["board"]
    renamed = client.patch(f"/lists/{lst['id']}", json={"name": "Súper"}).json()
    assert renamed["board"] == assigned


def test_members_rotate_independently(
    client: TestClient, other_client: TestClient, session: Session, other_user: User
):
    """Each member walks their own rotation: the shared list is Alice's second
    open but Bob's first, so they see different boards on the same list."""
    solo = _make_list(client, name="Solo Alice")
    shared = _make_list(client, name="Compartida")
    assert client.get(f"/lists/{solo['id']}").json()["board"] == BOARDS[0]
    alice_shared = client.get(f"/lists/{shared['id']}").json()["board"]
    assert alice_shared == BOARDS[1]

    _join(session, shared["id"], other_user)
    bob_shared = other_client.get(f"/lists/{shared['id']}").json()["board"]

    assert bob_shared == BOARDS[0]
    assert bob_shared != alice_shared


def test_board_write_does_not_cross_members(
    client: TestClient, other_client: TestClient, session: Session, other_user: User, user: User
):
    shared = _make_list(client)
    _join(session, shared["id"], other_user)
    alice_before = client.get(f"/lists/{shared['id']}").json()["board"]
    other_client.get(f"/lists/{shared['id']}")

    resp = other_client.put(f"/lists/{shared['id']}/prefs/board", json={"board": "pizarra"})
    assert resp.status_code == 204

    assert client.get(f"/lists/{shared['id']}").json()["board"] == alice_before
    assert other_client.get(f"/lists/{shared['id']}").json()["board"] == "pizarra"


def test_put_board_before_any_open_creates_the_pref(
    client: TestClient, session: Session, user: User
):
    lst = _make_list(client)

    assert client.put(f"/lists/{lst['id']}/prefs/board", json={"board": "barro"}).status_code == 204

    assert client.get(f"/lists/{lst['id']}").json()["board"] == "barro"
    assert len(_prefs(session, user.id)) == 1


def test_put_board_rejects_values_outside_the_palette(client: TestClient):
    lst = _make_list(client)

    assert client.put(f"/lists/{lst['id']}/prefs/board", json={"board": "neon"}).status_code == 422


def test_put_board_guards_membership(client: TestClient, other_client: TestClient):
    lst = _make_list(client)

    assert (
        other_client.put(f"/lists/{lst['id']}/prefs/board", json={"board": "lino"}).status_code
        == 403
    )
    assert client.put("/lists/nope/prefs/board", json={"board": "lino"}).status_code == 404


def test_board_write_does_not_bump_updated_at(client: TestClient):
    """A personal pref must not trigger co-members' polls — neither the lazy
    assignment on open nor an explicit board write may move updated_at."""
    lst = _make_list(client)
    before = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]

    client.get(f"/lists/{lst['id']}")
    assert (
        client.put(f"/lists/{lst['id']}/prefs/board", json={"board": "salvia"}).status_code == 204
    )

    assert client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"] == before


def test_member_removal_deletes_only_their_pref(
    client: TestClient, other_client: TestClient, session: Session, user: User, other_user: User
):
    shared = _make_list(client)
    _join(session, shared["id"], other_user)
    client.get(f"/lists/{shared['id']}")
    other_client.get(f"/lists/{shared['id']}")

    resp = client.delete(f"/lists/{shared['id']}/members/{other_user.id}")
    assert resp.status_code == 204

    assert _prefs(session, other_user.id) == []
    assert len(_prefs(session, user.id)) == 1


def test_leaving_deletes_own_pref(
    client: TestClient, other_client: TestClient, session: Session, other_user: User
):
    shared = _make_list(client)
    _join(session, shared["id"], other_user)
    other_client.get(f"/lists/{shared['id']}")

    resp = other_client.delete(f"/lists/{shared['id']}/members/{other_user.id}")
    assert resp.status_code == 204

    assert _prefs(session, other_user.id) == []


def test_delete_list_deletes_every_members_pref(
    client: TestClient, other_client: TestClient, session: Session, user: User, other_user: User
):
    shared = _make_list(client)
    _join(session, shared["id"], other_user)
    client.get(f"/lists/{shared['id']}")
    other_client.get(f"/lists/{shared['id']}")

    assert client.delete(f"/lists/{shared['id']}").status_code == 204

    assert session.exec(select(UserListPref)).all() == []


# --- service-level: the concurrent-first-open race ---


@pytest.fixture(name="lst")
def lst_fixture(session: Session, user: User) -> List:
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.flush()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    session.commit()
    session.refresh(lst)
    return lst


def _missing_once(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the session's first exec() come up empty, like a lost race's lookup."""
    real_exec = session.exec

    calls = {"n": 0}

    class _Empty:
        def first(self):
            return None

    def exec_missing_once(statement, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Empty()
        return real_exec(statement, *args, **kwargs)

    monkeypatch.setattr(session, "exec", exec_missing_once)


def test_the_race_loser_receives_the_winners_board(
    session: Session, user: User, lst: List, monkeypatch: pytest.MonkeyPatch
):
    """Two devices opening the list at once can both miss the SELECT and both
    INSERT. The unique constraint fails the loser; ensure_board must hand back
    the winner's board rather than fail the open."""
    winner = ensure_board(session, user.id, lst.id)
    session.commit()

    _missing_once(session, monkeypatch)

    assert ensure_board(session, user.id, lst.id) == winner
    assert len(session.exec(select(UserListPref)).all()) == 1


def test_an_unrelated_integrity_error_surfaces_as_itself(session: Session, lst: List):
    """The except IntegrityError exists for one race only. Any other constraint
    failure — here a NOT NULL violation on user_id — must re-raise as itself
    when the re-select finds nothing."""
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        ensure_board(session, None, lst.id)  # type: ignore[arg-type]
