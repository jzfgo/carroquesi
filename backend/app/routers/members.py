import logging
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListMember, User, UserListPref
from app.dependencies import CurrentSession, CurrentUser, MemberDep, OwnerDep
from app.schemas.members import (
    AddMemberRequest,
    InviteCreated,
    MemberRead,
    TransferOwnershipRequest,
)
from app.services.push import notify_ownership_change

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lists/{list_id}/members", tags=["members"])

# Ownership is a property of the list, not of a membership row, so the transfer
# endpoint lives one path segment up from the members collection.
owner_router = APIRouter(prefix="/lists/{list_id}", tags=["members"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.add(lst)


def _notify_safely(session: Session, lst: List, actor: User, new_owner_id: str) -> None:
    """Push is best-effort. A notification failure must never fail the transfer."""
    try:
        notify_ownership_change(session, lst, actor, new_owner_id)
    except Exception:  # pragma: no cover - notify_ownership_change already swallows
        logger.exception("push notification failed for list %s", lst.id)


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
            display_name=user.display_name or user.email.split("@")[0],
            photo_url=user.photo_url,
        )
        for member, user in results
    ]


@router.post("", response_model=InviteCreated, status_code=status.HTTP_202_ACCEPTED)
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


@owner_router.put("/owner", status_code=status.HTTP_204_NO_CONTENT)
def transfer_ownership(
    body: TransferOwnershipRequest,
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user

    if body.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already the owner")

    member = session.exec(
        select(ListMember).where(ListMember.list_id == lst.id, ListMember.user_id == body.user_id)
    ).first()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Only owner_id moves. Memberships (including the old owner's) and default-list
    # flags stay exactly as they are; leaving afterwards is a separate call.
    lst.owner_id = body.user_id
    _bump(lst, session)
    session.commit()

    _notify_safely(session, lst, current_user, new_owner_id=body.user_id)


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
        # The owner leaving is recoverable — hand the list over first — so their
        # own attempt names that way out. Anyone else targeting the owner is
        # simply not allowed to remove them.
        if current_user.id == user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Transfer ownership before leaving"
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the list owner"
        )

    # Only owner or the member themselves can remove
    if current_user.id != lst.owner_id and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    member = session.exec(
        select(ListMember).where(ListMember.list_id == list_id, ListMember.user_id == user_id)
    ).first()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    session.delete(member)
    # The board pref is state about a membership, so it leaves with it. A
    # later re-join starts clean and gets a fresh lazy assignment.
    pref = session.exec(
        select(UserListPref).where(UserListPref.list_id == list_id, UserListPref.user_id == user_id)
    ).first()
    if pref is not None:
        session.delete(pref)
    _bump(lst, session)
    session.commit()
