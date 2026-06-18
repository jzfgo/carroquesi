from typing import Annotated

from fastapi import APIRouter, Header

from app.db.models import FeedbackSubmission
from app.dependencies import CurrentSession, CurrentUser
from app.schemas.feedback import FeedbackCreate, FeedbackRead

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackRead)
def create_feedback(
    body: FeedbackCreate,
    session: CurrentSession,
    current_user: CurrentUser,
    user_agent: Annotated[str | None, Header()] = None,
) -> FeedbackSubmission:
    feedback = FeedbackSubmission(
        user_id=current_user.id,
        message=body.message,
        email=str(body.email) if body.email else None,
        source=body.source,
        user_agent=user_agent,
    )
    session.add(feedback)
    session.commit()
    session.refresh(feedback)
    return feedback
