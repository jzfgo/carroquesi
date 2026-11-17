from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func
from sqlmodel import select

from app.db.models import List, ListInvite, ListMember, User
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.invites import AcceptInviteResult, InvitePreview, InviteRead, OpenInviteCreated
from app.services.default_list import ensure_default

router = APIRouter(prefix="/invites", tags=["invites"])

MAX_MEMBERS = 5
MAX_OPEN_INVITES = 5
INVITE_TTL_HOURS = 24


def _check_not_expired(invite: ListInvite) -> None:
    cutoff = datetime.now(UTC) - timedelta(hours=INVITE_TTL_HOURS)
    if invite.created_at < cutoff:
        raise HTTPException(status_code=410, detail="Invite expired")


list_invites_router = APIRouter(prefix="/lists/{list_id}/invites", tags=["invites"])


def create_open_invite(
    list_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    _, current_user = list_and_user

    members = session.exec(select(ListMember).where(ListMember.list_id == list_id)).all()
    if len(members) >= MAX_MEMBERS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="List is full")

    cutoff = datetime.now(UTC) - timedelta(hours=INVITE_TTL_HOURS)
    expired = session.exec(
        select(ListInvite).where(ListInvite.list_id == list_id, ListInvite.created_at < cutoff)
    ).all()
    for inv in expired:
        session.delete(inv)
    session.flush()

    open_invite_count = session.exec(
        select(func.count(ListInvite.id)).where(ListInvite.list_id == list_id)
    ).one()
    if open_invite_count >= MAX_OPEN_INVITES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many open invites"
        )

    invite = ListInvite(list_id=list_id, invited_by=current_user.id, invited_email=None)
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return {"id": invite.id}


list_invites_router.post("", response_model=OpenInviteCreated, status_code=status.HTTP_201_CREATED)(
    create_open_invite
)


def get_my_invites(
    current_user: CurrentUser,
    session: CurrentSession,
):
    invites = session.exec(
        select(ListInvite).where(ListInvite.invited_email == current_user.email)
    ).all()
    return invites


router.get("", response_model=list[InviteRead])(get_my_invites)


def get_invite_preview(invite_id: str, session: CurrentSession):
    """Public endpoint — no auth required. Used to show invite details before login."""
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    _check_not_expired(invite)
    lst = session.get(List, invite.list_id)
    inviter = session.get(User, invite.invited_by)
    return InvitePreview(
        id=invite.id,
        list_name=lst.name if lst else "Unknown list",
        list_emoji=lst.emoji if lst else None,
        invited_by_name=inviter.display_name if inviter else None,
    )


router.get("/{invite_id}", response_model=InvitePreview)(get_invite_preview)


def accept_invite(
    invite_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    _check_not_expired(invite)

    # Email-locked invite: only the matching user can accept
    if invite.invited_email is not None and invite.invited_email != current_user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This invite is not for you"
        )

    # Member cap guard (race condition protection)
    member_count = session.exec(
        select(func.count(ListMember.id)).where(ListMember.list_id == invite.list_id)
    ).one()
    if member_count >= MAX_MEMBERS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="List is full")

    # Idempotent: already a member — just delete the invite
    existing = session.exec(
        select(ListMember).where(
            ListMember.list_id == invite.list_id, ListMember.user_id == current_user.id
        )
    ).first()
    if not existing:
        member = ListMember(list_id=invite.list_id, user_id=current_user.id)
        session.add(member)
        # First list a user ever creates or joins becomes their default (for Siri).
        ensure_default(session, member)
        # Bump lists.updated_at for polling
        lst = session.get(List, invite.list_id)
        if lst:
            lst.updated_at = datetime.now(UTC)
            session.add(lst)

    list_id = invite.list_id
    session.delete(invite)
    session.commit()
    return {"list_id": list_id}


router.post("/{invite_id}/accept", response_model=AcceptInviteResult)(accept_invite)


def decline_invite(
    invite_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    lst = session.get(List, invite.list_id)
    is_owner = lst and lst.owner_id == current_user.id
    is_invitee = invite.invited_email is not None and invite.invited_email == current_user.email

    if not is_owner and not is_invitee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    session.delete(invite)
    session.commit()


router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)(decline_invite)
