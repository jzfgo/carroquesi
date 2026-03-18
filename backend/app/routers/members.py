from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListMember, User
from app.db.session import get_session
from app.dependencies import get_current_user, require_member, require_owner
from app.schemas.members import AddMemberRequest, MemberRead

router = APIRouter(prefix="/lists/{list_id}/members", tags=["members"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(lst)


@router.get("", response_model=list[MemberRead])
def get_members(
    list_and_user: tuple = Depends(require_member),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    members = session.exec(select(ListMember).where(ListMember.list_id == lst.id)).all()
    return members


@router.post("")
def add_member(
    body: AddMemberRequest,
    response: Response,
    list_and_user: tuple = Depends(require_owner),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    target_user = session.exec(select(User).where(User.email == body.email)).first()

    if target_user is None:
        # User not registered yet — create a pending invite
        invite = ListInvite(list_id=lst.id, invited_email=body.email, invited_by=lst.owner_id)
        session.add(invite)
        _bump(lst, session)
        session.commit()
        response.status_code = status.HTTP_202_ACCEPTED
        return {"status": "invited", "email": body.email}

    existing = session.exec(
        select(ListMember).where(ListMember.list_id == lst.id, ListMember.user_id == target_user.id)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    member = ListMember(list_id=lst.id, user_id=target_user.id)
    session.add(member)
    _bump(lst, session)
    session.commit()
    session.refresh(member)
    response.status_code = status.HTTP_201_CREATED
    return MemberRead(
        id=member.id,
        user_id=member.user_id,
        list_id=member.list_id,
        created_at=member.created_at,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: str,
    list_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    # Only owner or the member themselves can remove
    if current_user.id != lst.owner_id and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    member = session.exec(
        select(ListMember).where(ListMember.list_id == list_id, ListMember.user_id == user_id)
    ).first()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    session.delete(member)
    _bump(lst, session)
    session.commit()
