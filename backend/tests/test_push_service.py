from datetime import datetime

from sqlmodel import Session

from app.db.models import List, ListItem, ListMember, PushToken, User


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
