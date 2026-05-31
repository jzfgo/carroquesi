from fastapi import APIRouter, Depends, Header
from sqlmodel import Session

from app.db.models import FeedbackSubmission, User
from app.db.session import get_session
from app.dependencies import get_current_user
from app.schemas.feedback import FeedbackCreate, FeedbackRead

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackRead)
def create_feedback(
    body: FeedbackCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    user_agent: str | None = Header(default=None),
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
