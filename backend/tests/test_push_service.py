import threading
import time
from datetime import datetime
from unittest.mock import MagicMock, patch

from firebase_admin import messaging
from sqlmodel import Session, select

from app.db.models import List, ListItem, ListMember, PushToken, User
from app.services.push import (
    notify_list_change,
    recipients_for,
    unseen_count_for,
    watermark_for,
)


def test_push_token_round_trips(session: Session, user: User):
    token = PushToken(user_id=user.id, token="tok-1")
    session.add(token)
    session.commit()
    session.refresh(token)
    assert token.id
    assert token.last_registered_at is not None


def test_list_member_watermark_defaults_to_null(session: Session, user: User):
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    member = ListMember(list_id=lst.id, user_id=user.id)
    session.add(member)
    session.commit()
    session.refresh(member)
    assert member.last_seen_at is None
    assert isinstance(member.created_at, datetime)


def test_list_item_purchaser_defaults_to_null(session: Session, user: User):
    lst = List(name="Casa", owner_id=user.id)
    session.add(lst)
    session.commit()
    item = ListItem(list_id=lst.id, name="leche", added_by=user.id)
    session.add(item)
    session.commit()
    session.refresh(item)
    assert item.purchased_by is None


def _make_shared_list(session, owner, member):
    lst = List(name="Casa", owner_id=owner.id)
    session.add(lst)
    session.commit()
    session.add(ListMember(list_id=lst.id, user_id=owner.id))
    session.add(ListMember(list_id=lst.id, user_id=member.id))
    session.commit()
    return lst


def test_recipients_exclude_the_actor(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    session.add(PushToken(user_id=user.id, token="actor-tok"))
    session.add(PushToken(user_id=other_user.id, token="other-tok"))
    session.commit()

    result = recipients_for(session, lst.id, actor_id=user.id)

    assert list(result) == [other_user.id]
    assert result[other_user.id].tokens == ["other-tok"]


def test_recipients_empty_for_solo_list(session, user):
    lst = List(name="Solo", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    session.add(PushToken(user_id=user.id, token="tok"))
    session.commit()

    assert recipients_for(session, lst.id, actor_id=user.id) == {}


def test_recipients_skip_members_without_tokens(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    assert recipients_for(session, lst.id, actor_id=user.id) == {}


def test_count_includes_others_adds_and_purchases_only(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    watermark = datetime(2026, 1, 1)

    session.add(
        ListItem(
            list_id=lst.id, name="mine", added_by=other_user.id, created_at=datetime(2026, 1, 2)
        )
    )
    session.add(
        ListItem(list_id=lst.id, name="theirs", added_by=user.id, created_at=datetime(2026, 1, 2))
    )
    session.add(
        ListItem(list_id=lst.id, name="old", added_by=user.id, created_at=datetime(2025, 12, 1))
    )
    session.commit()

    # Recipient is other_user: only the item added by `user` counts.
    assert unseen_count_for(session, lst.id, other_user.id, watermark) == 1


def test_count_treats_unknown_purchaser_as_someone_else(session, user, other_user):
    """Rows predating purchased_by have NULL. SQL `!=` on NULL yields NULL, which
    would silently drop them; is_distinct_from treats NULL as 'not me'."""
    lst = _make_shared_list(session, user, other_user)
    watermark = datetime(2026, 1, 1)
    session.add(
        ListItem(
            list_id=lst.id,
            name="legacy",
            added_by=other_user.id,
            created_at=datetime(2025, 12, 1),
            purchased_at=datetime(2026, 1, 2),
            purchased_by=None,
        )
    )
    session.commit()

    assert unseen_count_for(session, lst.id, other_user.id, watermark) == 1


def test_count_uses_join_time_when_never_seen(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    member = session.exec(
        select(ListMember).where(ListMember.list_id == lst.id, ListMember.user_id == other_user.id)
    ).one()
    member.last_seen_at = None
    member.created_at = datetime(2026, 1, 10)
    session.add(
        ListItem(
            list_id=lst.id, name="before-join", added_by=user.id, created_at=datetime(2026, 1, 5)
        )
    )
    session.add(
        ListItem(
            list_id=lst.id, name="after-join", added_by=user.id, created_at=datetime(2026, 1, 15)
        )
    )
    session.commit()

    # Assert the watermark helper directly: this member holds no token, so
    # recipients_for would return {} and tell us nothing about the fallback.
    assert watermark_for(member) == datetime(2026, 1, 10)
    assert unseen_count_for(session, lst.id, other_user.id, watermark_for(member)) == 1


def _fake_response(success: bool, exception=None):
    resp = MagicMock()
    resp.success = success
    resp.exception = exception
    return resp


def _batch_for(message, exception=None):
    """A BatchResponse-shaped mock with exactly one response per token sent.

    We patch send_each_for_multicast, NOT the whole messaging module, so
    _build_message constructs a real MulticastMessage and _is_dead_token sees the
    real typed exceptions. Production zips tokens against responses with
    strict=True, so the response count here must match message.tokens — a
    mismatch is a genuine bug we want surfaced, not swallowed.
    """
    return MagicMock(
        responses=[_fake_response(exception is None, exception) for _ in message.tokens]
    )


def test_send_is_one_multicast_per_recipient_user(session, user, other_user):
    """Counts differ per recipient, so recipients must not share a multicast."""
    third = User(firebase_uid="uid-carol", display_name="Carol", email="c@example.com")
    session.add(third)
    session.commit()
    lst = _make_shared_list(session, user, other_user)
    third_member = ListMember(list_id=lst.id, user_id=third.id)
    session.add(third_member)
    # Deterministic watermarks so the counts are stable and genuinely differ.
    for m in session.exec(select(ListMember).where(ListMember.list_id == lst.id)).all():
        m.last_seen_at = datetime(2026, 1, 1)
    session.add(PushToken(user_id=other_user.id, token="bob-phone"))
    session.add(PushToken(user_id=other_user.id, token="bob-laptop"))
    session.add(PushToken(user_id=third.id, token="carol-phone"))
    # Actor's item counts for both; Bob's item counts for Carol but not Bob.
    session.add(
        ListItem(list_id=lst.id, name="por-user", added_by=user.id, created_at=datetime(2026, 1, 2))
    )
    session.add(
        ListItem(
            list_id=lst.id, name="por-bob", added_by=other_user.id, created_at=datetime(2026, 1, 2)
        )
    )
    session.commit()

    with patch("app.services.push.messaging.send_each_for_multicast") as send:
        send.side_effect = lambda message: _batch_for(message)
        notify_list_change(session, lst, user, "added", "leche")

    # Two users -> two calls. Bob's two devices share one.
    assert send.call_count == 2

    # And each recipient got THEIR OWN count, not a shared one. This is the
    # invariant the whole derived-count design rests on: call_count alone passes
    # even if both recipients received an identical wrong number.
    count_by_token = {}
    for call in send.call_args_list:
        message = call.args[0]
        for tok in message.tokens:
            count_by_token[tok] = message.data["unseen_count"]
    assert count_by_token["bob-phone"] == count_by_token["bob-laptop"] == "1"
    assert count_by_token["carol-phone"] == "2"


def test_send_skipped_entirely_when_no_recipients(session, user):
    lst = List(name="Solo", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    session.commit()

    with patch("app.services.push.messaging.send_each_for_multicast") as send:
        notify_list_change(session, lst, user, "added", "leche")

    send.assert_not_called()


def test_unregistered_token_is_pruned(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    session.add(PushToken(user_id=other_user.id, token="dead-tok"))
    session.commit()

    with patch("app.services.push.messaging.send_each_for_multicast") as send:
        # A real typed UnregisteredError, the only signal that prunes. A prior
        # version matched the substring "not found" in any exception, which would
        # have let a global misconfiguration wipe the whole table.
        send.side_effect = lambda message: _batch_for(
            message, exception=messaging.UnregisteredError("Requested entity was not found")
        )
        notify_list_change(session, lst, user, "added", "leche")

    assert session.exec(select(PushToken).where(PushToken.token == "dead-tok")).first() is None


def test_generic_send_failure_does_not_prune(session, user, other_user):
    """A non-typed failure (outage, quota, credential) must NOT delete tokens —
    that would disable push for exactly the closed-app audience it serves."""
    lst = _make_shared_list(session, user, other_user)
    session.add(PushToken(user_id=other_user.id, token="live-tok"))
    session.commit()

    with patch("app.services.push.messaging.send_each_for_multicast") as send:
        send.side_effect = lambda message: _batch_for(
            message, exception=messaging.QuotaExceededError("quota")
        )
        notify_list_change(session, lst, user, "added", "leche")

    assert session.exec(select(PushToken).where(PushToken.token == "live-tok")).one()


def test_fcm_failure_never_raises(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    session.add(PushToken(user_id=other_user.id, token="tok"))
    session.commit()

    with patch("app.services.push.messaging.send_each_for_multicast") as send:
        send.side_effect = RuntimeError("FCM down")
        notify_list_change(session, lst, user, "added", "leche")  # must not raise


def test_send_returns_within_budget_when_fcm_hangs(session, user, other_user):
    """The timeout must actually bound the handler.

    A `with ThreadPoolExecutor(...)` block joins every submitted future on exit,
    so `wait(timeout=...)` alone bounds nothing — a hung send would still hold
    the request open. Every other test here returns or raises instantly and so
    cannot tell the difference; this one can.
    """
    lst = _make_shared_list(session, user, other_user)
    session.add(PushToken(user_id=other_user.id, token="tok"))
    session.commit()

    release = threading.Event()

    def _hang(message):
        release.wait(30)
        return _batch_for(message)

    try:
        with (
            patch("app.services.push.messaging.send_each_for_multicast") as send,
            patch("app.services.push.SEND_TIMEOUT_SECONDS", 0.1),
        ):
            send.side_effect = _hang
            started = time.monotonic()
            notify_list_change(session, lst, user, "added", "leche")
            elapsed = time.monotonic() - started
    finally:
        # Release the abandoned worker so it cannot linger into later tests.
        release.set()

    assert elapsed < 5


def test_adding_an_item_notifies(client, session, user, other_user):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    session.add(ListMember(list_id=lst["id"], user_id=other_user.id))
    session.add(PushToken(user_id=other_user.id, token="tok"))
    session.commit()

    with patch("app.routers.items.notify_list_change") as notify:
        client.post(f"/lists/{lst['id']}/items", json={"name": "leche"})

    notify.assert_called_once()
    assert notify.call_args.args[3] == "added"


def test_purchasing_notifies_and_records_purchaser(client, session, user):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "leche"}).json()

    with patch("app.routers.items.notify_list_change") as notify:
        client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    assert notify.call_args.args[3] == "purchased"
    session.expire_all()
    assert session.get(ListItem, item["id"]).purchased_by == user.id


def test_unpurchasing_does_not_notify(client, session, user):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "leche"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    with patch("app.routers.items.notify_list_change") as notify:
        client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})

    notify.assert_not_called()


def test_renaming_does_not_notify(client, session, user):
    lst = client.post("/lists", json={"name": "Casa"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "leche"}).json()

    with patch("app.routers.items.notify_list_change") as notify:
        client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"name": "leche entera"})

    notify.assert_not_called()


def test_item_write_succeeds_when_push_raises(client, session, user):
    lst = client.post("/lists", json={"name": "Casa"}).json()

    with patch("app.routers.items.notify_list_change", side_effect=RuntimeError("boom")):
        resp = client.post(f"/lists/{lst['id']}/items", json={"name": "leche"})

    assert resp.status_code == 201
