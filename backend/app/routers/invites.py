from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListMember, User
from app.db.session import get_session
from app.dependencies import get_current_user
from app.schemas.invites import InvitePreview, InviteRead

router = APIRouter(prefix="/invites", tags=["invites"])


@router.get("", response_model=list[InviteRead])
def get_my_invites(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invites = session.exec(
        select(ListInvite).where(ListInvite.invited_email == current_user.email)
    ).all()
    return invites


@router.get("/{invite_id}", response_model=InvitePreview)
def get_invite_preview(invite_id: str, session: Session = Depends(get_session)):
    """Public endpoint — no auth required. Used to show invite details before login."""
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    lst = session.get(List, invite.list_id)
    inviter = session.get(User, invite.invited_by)
    return InvitePreview(
        id=invite.id,
        list_name=lst.name if lst else "Unknown list",
        invited_by_name=inviter.display_name if inviter else None,
    )


@router.post("/{invite_id}/accept")
def accept_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    # Email-locked invite: only the matching user can accept
    if invite.invited_email is not None and invite.invited_email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite is not for you")

    # Idempotent: already a member — just delete the invite
    existing = session.exec(
        select(ListMember).where(
            ListMember.list_id == invite.list_id, ListMember.user_id == current_user.id
        )
    ).first()
    if not existing:
        member = ListMember(list_id=invite.list_id, user_id=current_user.id)
        session.add(member)

    session.delete(invite)
    session.commit()
    return {"status": "accepted"}


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def decline_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    lst = session.get(List, invite.list_id)
    is_owner = lst and lst.owner_id == current_user.id
    is_invitee = invite.invited_email == current_user.email or invite.invited_email is None

    if not is_owner and not is_invitee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    session.delete(invite)
    session.commit()
