from datetime import datetime, timezone

from fastapi import APIRouter, status
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListItem, ListMember
from app.db.session import get_session
from app.dependencies import CurrentSession, CurrentUser, MemberDep, OwnerDep
from app.schemas.lists import ListCreate, ListRead, ListUpdate

router = APIRouter(prefix="/lists", tags=["lists"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(lst)


@router.get("", response_model=list[ListRead])
def get_lists(current_user: CurrentUser, session: CurrentSession):
    memberships = session.exec(select(ListMember).where(ListMember.user_id == current_user.id)).all()
    list_ids = [m.list_id for m in memberships]
    lists = session.exec(select(List).where(List.id.in_(list_ids))).all()
    return lists


@router.post("", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_list(
    body: ListCreate,
    current_user: CurrentUser,
    session: CurrentSession,
):
    lst = List(name=body.name, owner_id=current_user.id)
    session.add(lst)
    session.flush()  # get lst.id before committing
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
def rename_list(
    body: ListUpdate,
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    lst.name = body.name
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
    session.delete(lst)
    session.commit()
