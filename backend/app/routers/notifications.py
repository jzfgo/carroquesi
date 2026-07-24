from datetime import UTC, datetime

from fastapi import APIRouter, Response, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.db.models import ListMember, PushToken
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.notifications import PushTokenBody

router = APIRouter(prefix="/notifications", tags=["notifications"])
list_seen_router = APIRouter(prefix="/lists", tags=["notifications"])


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _claim(token_row: PushToken, user_id: str) -> None:
    """Reassign rather than reject: a shared or handed-down device must not keep
    delivering the previous user's lists."""
    token_row.user_id = user_id
    token_row.last_registered_at = _now()


@router.post("/tokens", status_code=status.HTTP_204_NO_CONTENT)
def register_token(body: PushTokenBody, session: CurrentSession, current_user: CurrentUser):
    existing = session.exec(select(PushToken).where(PushToken.token == body.token)).first()
    if existing is not None:
        _claim(existing, current_user.id)
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    session.add(PushToken(user_id=current_user.id, token=body.token))
    try:
        session.commit()
    except IntegrityError:
        # A concurrent registration of the same token won the unique index.
        # Registration must stay idempotent, so adopt the winner's row rather
        # than 500. The SQLite test harness serialises on StaticPool and can
        # never reach this path; the pattern mirrors barcode.py and waitlist.py.
        session.rollback()
        winner = session.exec(select(PushToken).where(PushToken.token == body.token)).first()
        if winner is None:
            raise
        _claim(winner, current_user.id)
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
    # .one(), not .first(): require_member has already 403'd in this same
    # transaction if the membership is absent, so the row provably exists. A
    # None-guard here could only convert a future dependency swap into a 204
    # that silently failed to write the watermark.
    membership = session.exec(
        select(ListMember).where(
            ListMember.list_id == lst.id, ListMember.user_id == current_user.id
        )
    ).one()
    membership.last_seen_at = _now()
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
