"""Unit tests for app.services.default_list, especially backfill_all_defaults.

The migration that adds is_default calls this helper. The test suite builds its
schema with create_all and never runs Alembic, so without these tests the
backfill — the piece the JAV-43 caveat calls out ("correctly sets the default
for all current users") — would ship uncovered.
"""

from datetime import datetime

from sqlmodel import Session, select

from app.db.models import List, ListMember, User
from app.services.default_list import (
    backfill_all_defaults,
    ensure_default,
    has_default,
)


def _user(session: Session, uid: str) -> User:
    u = User(firebase_uid=uid, email=f"{uid}@example.com")
    session.add(u)
    session.flush()
    return u


def _list(session: Session, owner_id: str, name: str, updated_at: datetime) -> List:
    lst = List(name=name, owner_id=owner_id, updated_at=updated_at)
    session.add(lst)
    session.flush()
    return lst


def _member(session: Session, list_id: str, user_id: str) -> ListMember:
    m = ListMember(list_id=list_id, user_id=user_id)
    session.add(m)
    session.flush()
    return m


def test_backfill_pins_most_recently_updated_list(session: Session):
    user = _user(session, "u1")
    older = _list(session, user.id, "Older", datetime(2026, 1, 1))
    newer = _list(session, user.id, "Newer", datetime(2026, 6, 1))
    _member(session, older.id, user.id)
    _member(session, newer.id, user.id)

    assigned = backfill_all_defaults(session)

    assert assigned == 1
    defaults = session.exec(
        select(ListMember).where(ListMember.user_id == user.id, ListMember.is_default.is_(True))
    ).all()
    assert len(defaults) == 1
    assert defaults[0].list_id == newer.id


def test_backfill_tiebreaker_is_deterministic(session: Session):
    """Two lists sharing an updated_at must not both be flagged; id DESC breaks
    the tie so exactly one default results."""
    user = _user(session, "u1")
    same = datetime(2026, 3, 1)
    a = _list(session, user.id, "A", same)
    b = _list(session, user.id, "B", same)
    _member(session, a.id, user.id)
    _member(session, b.id, user.id)

    backfill_all_defaults(session)

    defaults = session.exec(
        select(ListMember).where(ListMember.user_id == user.id, ListMember.is_default.is_(True))
    ).all()
    assert len(defaults) == 1
    assert defaults[0].list_id == max(a.id, b.id)


def test_backfill_skips_users_already_flagged(session: Session):
    user = _user(session, "u1")
    keep = _list(session, user.id, "Keep", datetime(2026, 1, 1))
    other = _list(session, user.id, "Other", datetime(2026, 6, 1))
    _member(session, keep.id, user.id).is_default = True
    _member(session, other.id, user.id)
    session.flush()

    assigned = backfill_all_defaults(session)

    assert assigned == 0  # already had a default; must not be moved to MRU
    defaults = session.exec(
        select(ListMember).where(ListMember.user_id == user.id, ListMember.is_default.is_(True))
    ).all()
    assert [d.list_id for d in defaults] == [keep.id]


def test_backfill_is_idempotent(session: Session):
    user = _user(session, "u1")
    lst = _list(session, user.id, "L", datetime(2026, 1, 1))
    _member(session, lst.id, user.id)

    assert backfill_all_defaults(session) == 1
    assert backfill_all_defaults(session) == 0


def test_backfill_covers_join_only_users(session: Session):
    """A user who never owns a list but is a member of one still gets a default."""
    owner = _user(session, "owner")
    joiner = _user(session, "joiner")
    shared = _list(session, owner.id, "Shared", datetime(2026, 1, 1))
    _member(session, shared.id, owner.id)
    _member(session, shared.id, joiner.id)

    backfill_all_defaults(session)

    assert has_default(session, joiner.id)


def test_ensure_default_is_noop_when_already_set(session: Session):
    user = _user(session, "u1")
    first = _list(session, user.id, "First", datetime(2026, 1, 1))
    second = _list(session, user.id, "Second", datetime(2026, 2, 1))
    m1 = _member(session, first.id, user.id)
    m1.is_default = True
    session.flush()
    m2 = _member(session, second.id, user.id)

    ensure_default(session, m2)

    assert m2.is_default is False
    assert m1.is_default is True
