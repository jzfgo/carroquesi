from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListItem, ListMember, ReceiptScan
from app.dependencies import CurrentSession, CurrentUser, MemberDep, OwnerDep
from app.schemas.lists import ListCreate, ListRead, ListUpdate

router = APIRouter(prefix="/lists", tags=["lists"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(lst)


@router.get("", response_model=list[ListRead])
def get_lists(current_user: CurrentUser, session: CurrentSession):
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]

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
    session.commit()
    session.refresh(lst)
    return lst


@router.get("/{list_id}", response_model=ListRead)
def get_list(list_and_user: MemberDep):
    lst, _ = list_and_user
    return lst


@router.patch("/{list_id}", response_model=ListRead)
def update_list(
    body: ListUpdate,
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    if body.name is not None:
        lst.name = body.name
    if "emoji" in body.model_fields_set:
        lst.emoji = body.emoji
    _bump(lst, session)
    session.commit()
    session.refresh(lst)
    return lst


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
