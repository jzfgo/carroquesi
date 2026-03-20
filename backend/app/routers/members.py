from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListMember, User
from app.dependencies import CurrentSession, CurrentUser, MemberDep, OwnerDep
from app.schemas.members import AddMemberRequest, MemberRead

router = APIRouter(prefix="/lists/{list_id}/members", tags=["members"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(lst)


@router.get("", response_model=list[MemberRead])
def get_members(
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    results = session.exec(
        select(ListMember, User)
        .join(User, User.id == ListMember.user_id)
        .where(ListMember.list_id == lst.id)
    ).all()
    return [
        MemberRead(
            id=member.id,
            user_id=member.user_id,
            list_id=member.list_id,
            created_at=member.created_at,
            display_name=user.display_name or "",
            photo_url=user.photo_url,
        )
        for member, user in results
    ]


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def add_member(
    body: AddMemberRequest,
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, _ = list_and_user

    # Check for duplicate pending invite
    existing_invite = session.exec(
        select(ListInvite).where(
            ListInvite.list_id == lst.id,
            ListInvite.invited_email == body.email,
        )
    ).first()
    if existing_invite:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite already pending")

    # Check if the email belongs to an existing user who is already a member
    target_user = session.exec(select(User).where(User.email == body.email)).first()
    if target_user is not None:
        already_member = session.exec(
            select(ListMember).where(
                ListMember.list_id == lst.id,
                ListMember.user_id == target_user.id,
            )
        ).first()
        if already_member:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    invite = ListInvite(list_id=lst.id, invited_email=body.email, invited_by=lst.owner_id)
    session.add(invite)
    _bump(lst, session)
    session.commit()
    return {"status": "invited", "email": body.email}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: str,
    list_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
):
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    if user_id == lst.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the list owner")

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
