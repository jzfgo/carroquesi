from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.session import get_session
from app.db.waitlist_models import WaitlistSignup
from app.dependencies import AdminUser
from app.schemas.waitlist import WaitlistSignupCreate, WaitlistSignupRead

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


@router.post("", response_model=WaitlistSignupRead)
def signup(
    body: WaitlistSignupCreate,
    session: Session = Depends(get_session),
):
    email_clean = body.email.strip().lower()
    existing = session.exec(
        select(WaitlistSignup).where(WaitlistSignup.email == email_clean)
    ).first()
    if existing:
        return existing

    new_signup = WaitlistSignup(email=email_clean, invite_token=body.invite_token)
    session.add(new_signup)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = session.exec(
            select(WaitlistSignup).where(WaitlistSignup.email == email_clean)
        ).first()
        if existing:
            return existing
        raise HTTPException(status_code=503, detail="Database write error")

    session.refresh(new_signup)
    return new_signup



@router.get("/signups", response_model=list[WaitlistSignupRead])
def list_signups(
    current_admin: AdminUser,
    session: Session = Depends(get_session),
):
    return session.exec(
        select(WaitlistSignup).order_by(WaitlistSignup.created_at.desc())
    ).all()
