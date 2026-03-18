from fastapi import APIRouter, Depends

from app.db.models import User
from app.dependencies import get_current_user
from app.schemas.auth import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sync", response_model=UserRead)
def sync_user(current_user: User = Depends(get_current_user)):
    """
    Called by the frontend immediately after Firebase login.
    get_current_user already upserts the user in Postgres on first call.
    This endpoint simply returns the resolved user record.
    """
    return current_user
