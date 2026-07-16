from sqlmodel import Session, select

from app.db.models import ApiKey, User


def test_api_key_round_trips_through_db(session: Session, user: User):
    api_key = ApiKey(
        user_id=user.id,
        key_hash="a" * 64,
        key_ciphertext="gAAAAA-fake-ciphertext",
    )
    session.add(api_key)
    session.commit()
    session.refresh(api_key)

    fetched = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    assert fetched is not None
    assert fetched.key_hash == "a" * 64
    assert fetched.last_used_at is None
