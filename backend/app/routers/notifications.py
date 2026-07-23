from datetime import UTC, datetime

from fastapi import APIRouter, Response, status
from sqlmodel import select

from app.db.models import ListMember, PushToken
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.notifications import PushTokenBody

router = APIRouter(prefix="/notifications", tags=["notifications"])
list_seen_router = APIRouter(prefix="/lists", tags=["notifications"])


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


@router.post("/tokens", status_code=status.HTTP_204_NO_CONTENT)
def register_token(body: PushTokenBody, session: CurrentSession, current_user: CurrentUser):
    existing = session.exec(select(PushToken).where(PushToken.token == body.token)).first()
    if existing is not None:
        # Reassign rather than reject: a shared or handed-down device must not keep
        # delivering the previous user's lists.
        existing.user_id = current_user.id
        existing.last_registered_at = _now()
    else:
        session.add(PushToken(user_id=current_user.id, token=body.token))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/tokens", status_code=status.HTTP_204_NO_CONTENT)
def unregister_token(body: PushTokenBody, session: CurrentSession, current_user: CurrentUser):
    existing = session.exec(
        select(PushToken).where(PushToken.token == body.token, PushToken.user_id == current_user.id)
    ).first()
    if existing is not None:
        session.delete(existing)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@list_seen_router.post("/{list_id}/seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_list_seen(list_and_user: MemberDep, session: CurrentSession):
    """Reset the caller's unseen watermark for this list.

    Deliberately an explicit endpoint rather than a side effect of GET
    /lists/{id}/items: hanging it off the GET would make notification
    correctness depend on the visibilityState guard in useListItems.ts, an
    implicit cross-module invariant a refactor could remove silently. It also
    keeps a write out of a GET, which the offline queue retries. See ADR-010.
    """
    lst, current_user = list_and_user
    membership = session.exec(
        select(ListMember).where(
            ListMember.list_id == lst.id, ListMember.user_id == current_user.id
        )
    ).first()
    if membership is not None:
        membership.last_seen_at = _now()
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
