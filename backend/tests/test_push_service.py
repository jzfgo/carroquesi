from datetime import datetime

from sqlmodel import Session, select

from app.db.models import List, ListItem, ListMember, PushToken, User
from app.services.push import recipients_for, unseen_count_for, watermark_for


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
