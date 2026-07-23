from datetime import UTC, datetime

from fastapi import APIRouter, Response, status
from sqlmodel import select

from app.db.models import PushToken
from app.dependencies import CurrentSession, CurrentUser
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
