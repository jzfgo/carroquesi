from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListItem, ListMember, ReceiptScan
from app.dependencies import CurrentSession, CurrentUser, MemberDep, OwnerDep
from app.schemas.lists import ListCreate, ListRead, ListUpdate
from app.services.default_list import ensure_default, set_default

router = APIRouter(prefix="/lists", tags=["lists"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(lst)


def _read_with_default(lst: List, session: Session, user_id: str) -> ListRead:
    """Build a ListRead carrying this user's per-membership is_default flag.

    (item_count/purchased_count keep their ListRead defaults — the single-list
    endpoints don't recompute the aggregate; only get_lists does.)
    """
    membership = session.exec(
        select(ListMember).where(ListMember.list_id == lst.id, ListMember.user_id == user_id)
    ).first()
    return ListRead(**lst.model_dump(), is_default=bool(membership and membership.is_default))


@router.get("", response_model=list[ListRead])
def get_lists(current_user: CurrentUser, session: CurrentSession):
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]
    default_list_ids = {m.list_id for m in memberships if m.is_default}

    if not list_ids:
        return []

    lists = session.exec(
        select(List).where(List.id.in_(list_ids)).order_by(List.updated_at.desc())
    ).all()

    # Single aggregation query — counts for all lists at once.
    # Uses session.execute (SQLAlchemy) rather than session.exec (SQLModel)
    # because it returns named-column Row objects from aggregation queries.
    # Only count items that are in-scope for the current shopping session:
    # unpurchased items, plus items purchased today. Items purchased on prior
    # days are excluded from both the denominator and the numerator so the
    # progress bar reflects only the current trip.
    today = func.current_date()
    purchased_today = func.date(ListItem.purchased_at) == today
    in_scope = or_(ListItem.purchased_at.is_(None), purchased_today)

    count_stmt = (
        select(
            ListItem.list_id,
            func.count(ListItem.id).filter(in_scope).label("item_count"),
            func.count(ListItem.id).filter(purchased_today).label("purchased_count"),
        )
        .where(ListItem.list_id.in_(list_ids))
        .group_by(ListItem.list_id)
    )
    count_rows = session.execute(count_stmt).all()
    counts = {row.list_id: (row.item_count, row.purchased_count) for row in count_rows}

    return [
        ListRead(
            **lst.model_dump(),
            item_count=counts.get(lst.id, (0, 0))[0],
            purchased_count=counts.get(lst.id, (0, 0))[1],
            is_default=lst.id in default_list_ids,
        )
        for lst in lists
    ]


@router.post("", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_list(
    body: ListCreate,
    current_user: CurrentUser,
    session: CurrentSession,
):
    lst = List(name=body.name, emoji=body.emoji, owner_id=current_user.id)
    session.add(lst)
    session.flush()
    member = ListMember(list_id=lst.id, user_id=current_user.id)
    session.add(member)
    # First list a user ever creates or joins becomes their default (for Siri).
    ensure_default(session, member)
    session.commit()
    session.refresh(lst)
    session.refresh(member)
    return ListRead(**lst.model_dump(), is_default=member.is_default)


@router.get("/{list_id}", response_model=ListRead)
def get_list(list_and_user: MemberDep, session: CurrentSession):
    lst, current_user = list_and_user
    return _read_with_default(lst, session, current_user.id)


@router.patch("/{list_id}", response_model=ListRead)
def update_list(
    body: ListUpdate,
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    if body.name is not None:
        lst.name = body.name
    if "emoji" in body.model_fields_set:
        lst.emoji = body.emoji
    _bump(lst, session)
    session.commit()
    session.refresh(lst)
    # is_default carried through so a rename can't misreport the caller's default.
    return _read_with_default(lst, session, current_user.id)


@router.put("/{list_id}/default", status_code=status.HTTP_204_NO_CONTENT)
def set_default_list(
    list_and_user: MemberDep,
    session: CurrentSession,
):
    """Mark this list as the caller's default (for Siri), clearing any prior one.

    Per-user membership state — deliberately does NOT bump lists.updated_at, since
    the flag is invisible to co-members and shouldn't trigger their polls.
    """
    lst, current_user = list_and_user
    set_default(session, current_user.id, lst.id)
    session.commit()


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    for item in session.exec(select(ListItem).where(ListItem.list_id == lst.id)).all():
        session.delete(item)
    for member in session.exec(select(ListMember).where(ListMember.list_id == lst.id)).all():
        session.delete(member)
    for invite in session.exec(select(ListInvite).where(ListInvite.list_id == lst.id)).all():
        session.delete(invite)
    for scan in session.exec(select(ReceiptScan).where(ReceiptScan.list_id == lst.id)).all():
        session.delete(scan)
    session.delete(lst)
    session.commit()
