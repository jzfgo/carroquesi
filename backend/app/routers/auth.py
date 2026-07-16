from fastapi import APIRouter
from sqlmodel import select

from app.db.models import ApiKey
from app.dependencies import CurrentSession, CurrentUser
from app.schemas.auth import UserRead
from app.services import feature_flags

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(tags=["users"])


def _user_read(user, session) -> UserRead:
    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        photo_url=user.photo_url,
        features=feature_flags.get_enabled_flags(user.id, session),
        has_api_key=api_key is not None,
        api_key_last_used_at=api_key.last_used_at if api_key else None,
    )


@router.post("/sync", response_model=UserRead)
def sync_user(current_user: CurrentUser, session: CurrentSession):
    """Called by the frontend immediately after Firebase login."""
    return _user_read(current_user, session)


@users_router.get("/users/me", response_model=UserRead)
def get_me(current_user: CurrentUser, session: CurrentSession):
    """Polled by the frontend every 60 s to pick up flag changes mid-session."""
    return _user_read(current_user, session)
