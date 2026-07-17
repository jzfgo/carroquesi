from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ListMember, User


def _clear_default(session: Session, list_id: str) -> None:
    """Force a list_members row's is_default flag off, to construct the
    no-default-set state deliberately (auto-assign otherwise guarantees one)."""
    member = session.exec(select(ListMember).where(ListMember.list_id == list_id)).first()
    member.is_default = False
    session.add(member)
    session.commit()


def test_first_list_is_auto_assigned_as_default(client: TestClient):
    created = client.post("/lists", json={"name": "First"}).json()
    assert created["is_default"] is True

    response = client.get("/lists/default/items")
    assert response.status_code == 200
    added = client.post("/lists/default/items", json={"name": "milk"}).json()
    assert added["list_id"] == created["id"]


def test_default_ignores_most_recently_updated(client: TestClient):
    """The resolver is explicit-only — it must NOT track updated_at. A newer list
    that isn't the flagged default should never win 'default' (the removed MRU
    behaviour)."""
    first = client.post("/lists", json={"name": "First"}).json()  # auto-default
    second = client.post("/lists", json={"name": "Second"}).json()
    # Make the non-default list the most-recently-updated one.
    client.patch(f"/lists/{second['id']}", json={"name": "Second!"})

    added = client.post("/lists/default/items", json={"name": "milk"}).json()
    assert added["list_id"] == first["id"]


def test_set_default_switches_and_clears_prior(client: TestClient):
    first = client.post("/lists", json={"name": "First"}).json()  # auto-default
    second = client.post("/lists", json={"name": "Second"}).json()

    resp = client.put(f"/lists/{second['id']}/default")
    assert resp.status_code == 204

    # Resolver now points at the newly flagged list.
    added = client.post("/lists/default/items", json={"name": "milk"}).json()
    assert added["list_id"] == second["id"]

    # And exactly one list is flagged in the listing — the prior default cleared.
    lists = {lst["id"]: lst["is_default"] for lst in client.get("/lists").json()}
    assert lists[second["id"]] is True
    assert lists[first["id"]] is False


def test_default_404s_when_user_has_no_lists(client: TestClient):
    response = client.get("/lists/default/items")
    assert response.status_code == 404


def test_default_404s_when_lists_exist_but_none_flagged(client: TestClient, session: Session):
    """No most-recently-updated fallback: a user with lists but no default set
    gets a 404, not a silently-picked list."""
    created = client.post("/lists", json={"name": "Only"}).json()
    _clear_default(session, created["id"])

    response = client.get("/lists/default/items")
    assert response.status_code == 404


def test_deleting_default_leaves_no_default_no_promotion(client: TestClient):
    """No auto-promote: deleting your default strands you without one (a loud 404),
    even though another list remains. Re-picking is an explicit action."""
    first = client.post("/lists", json={"name": "First"}).json()  # auto-default
    client.post("/lists", json={"name": "Second"})

    assert client.delete(f"/lists/{first['id']}").status_code == 204

    # The surviving list did NOT silently inherit the default.
    assert client.get("/lists/default/items").status_code == 404
    remaining = client.get("/lists").json()
    assert all(lst["is_default"] is False for lst in remaining)


def test_joining_a_list_auto_assigns_default_for_a_new_user(
    client: TestClient, other_client: TestClient
):
    """A user who only ever joins lists still gets a default (their first join)."""
    shared = client.post("/lists", json={"name": "Shared"}).json()
    invite_id = client.post(f"/lists/{shared['id']}/invites").json()["id"]

    other_client.post(f"/invites/{invite_id}/accept")

    added = other_client.post("/lists/default/items", json={"name": "milk"}).json()
    assert added["list_id"] == shared["id"]


def test_default_is_per_membership_not_per_list(
    client: TestClient,
    other_client: TestClient,
    session: Session,
    user: User,
    other_user: User,
):
    """The same shared list can be one member's default without being the
    other's. Alice's choice must not touch Bob's membership row."""
    # Bob's own list becomes his default (first list).
    bob_list = other_client.post("/lists", json={"name": "Bob's"}).json()
    # Alice owns her own list (her auto-default) plus a shared one.
    other_client.post("/lists", json={"name": "Bob's extra"})  # noise
    alice_own = client.post("/lists", json={"name": "Alice's"}).json()
    shared = client.post("/lists", json={"name": "Shared"}).json()

    # Bring Bob into the shared list. He already has a default, so joining does
    # NOT overwrite it.
    invite_id = client.post(f"/lists/{shared['id']}/invites").json()["id"]
    other_client.post(f"/invites/{invite_id}/accept")

    # Alice explicitly makes the shared list her default.
    assert client.put(f"/lists/{shared['id']}/default").status_code == 204

    # Alice's default → shared; Bob's default → his own list, untouched.
    assert client.post("/lists/default/items", json={"name": "a"}).json()["list_id"] == shared["id"]
    assert (
        other_client.post("/lists/default/items", json={"name": "b"}).json()["list_id"]
        == bob_list["id"]
    )

    # And each user sees is_default only on their own chosen list.
    alice_lists = {lst["id"]: lst["is_default"] for lst in client.get("/lists").json()}
    assert alice_lists[shared["id"]] is True
    assert alice_lists[alice_own["id"]] is False

    bob_lists = {lst["id"]: lst["is_default"] for lst in other_client.get("/lists").json()}
    assert bob_lists[shared["id"]] is False
    assert bob_lists[bob_list["id"]] is True
