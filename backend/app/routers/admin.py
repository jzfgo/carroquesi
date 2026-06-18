from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.db.models import User, UserFeature
from app.dependencies import AdminUser, CurrentSession
from app.services import feature_flags

router = APIRouter(prefix="/admin", tags=["admin"])


def _now():
    return datetime.now(UTC).replace(tzinfo=None)


class FeatureToggleRequest(BaseModel):
    feature: str
    enabled: bool


class FeatureToggleResponse(BaseModel):
    user_id: str
    features: list[str]


@router.patch("/users/{user_id}/features", response_model=FeatureToggleResponse)
def toggle_user_feature(
    user_id: str,
    body: FeatureToggleRequest,
    session: CurrentSession,
    _admin: AdminUser,
):
    if body.feature not in feature_flags.REGISTRY:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown feature flag: {body.feature!r}",
        )

    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    row = session.exec(
        select(UserFeature).where(
            UserFeature.user_id == user_id,
            UserFeature.feature == body.feature,
        )
    ).first()

    if row is None:
        row = UserFeature(
            user_id=user_id,
            feature=body.feature,
            enabled=body.enabled,
            granted_by="admin",
        )
        session.add(row)
    else:
        row.enabled = body.enabled
        row.updated_at = _now()
        session.add(row)

    session.commit()

    return FeatureToggleResponse(
        user_id=user_id,
        features=feature_flags.get_enabled_flags(user_id, session),
    )
