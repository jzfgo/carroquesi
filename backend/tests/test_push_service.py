import threading
import time
from datetime import datetime
from unittest.mock import MagicMock, patch

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


def test_list_item_records_purchaser(session: Session, user: User):
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


def test_send_is_one_multicast_per_recipient_user(session, user, other_user):
    """Counts differ per recipient, so recipients must not share a multicast."""
    third = User(firebase_uid="uid-carol", display_name="Carol", email="c@example.com")
    session.add(third)
    session.commit()
    lst = _make_shared_list(session, user, other_user)
    session.add(ListMember(list_id=lst.id, user_id=third.id))
    session.add(PushToken(user_id=other_user.id, token="bob-phone"))
    session.add(PushToken(user_id=other_user.id, token="bob-laptop"))
    session.add(PushToken(user_id=third.id, token="carol-phone"))
    session.commit()

    with patch("app.services.push.messaging") as fcm:
        fcm.send_each_for_multicast.return_value = MagicMock(responses=[])
        notify_list_change(session, lst, user, "added", "leche")

    # Two users -> two calls. Bob's two devices share one.
    assert fcm.send_each_for_multicast.call_count == 2


def test_send_skipped_entirely_when_no_recipients(session, user):
    lst = List(name="Solo", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    session.commit()

    with patch("app.services.push.messaging") as fcm:
        notify_list_change(session, lst, user, "added", "leche")

    fcm.send_each_for_multicast.assert_not_called()


def test_unregistered_token_is_pruned(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    session.add(PushToken(user_id=other_user.id, token="dead-tok"))
    session.commit()

    with patch("app.services.push.messaging") as fcm:
        fcm.UnregisteredError = RuntimeError
        fcm.send_each_for_multicast.return_value = MagicMock(
            responses=[_fake_response(False, RuntimeError("Requested entity was not found"))]
        )
        notify_list_change(session, lst, user, "added", "leche")

    assert session.exec(select(PushToken).where(PushToken.token == "dead-tok")).first() is None


def test_fcm_failure_never_raises(session, user, other_user):
    lst = _make_shared_list(session, user, other_user)
    session.add(PushToken(user_id=other_user.id, token="tok"))
    session.commit()

    with patch("app.services.push.messaging") as fcm:
        fcm.send_each_for_multicast.side_effect = RuntimeError("FCM down")
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

    def _hang(*args, **kwargs):
        release.wait(30)
        return MagicMock(responses=[])

    try:
        with (
            patch("app.services.push.messaging") as fcm,
            patch("app.services.push.SEND_TIMEOUT_SECONDS", 0.1),
        ):
            fcm.send_each_for_multicast.side_effect = _hang
            started = time.monotonic()
            notify_list_change(session, lst, user, "added", "leche")
            elapsed = time.monotonic() - started
    finally:
        release.set()

    assert elapsed < 5
