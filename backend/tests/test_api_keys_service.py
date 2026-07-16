from sqlmodel import Session, select

from app.db.models import ApiKey, User
from app.services.api_keys import KEY_PREFIX, decrypt_key, encrypt_key, generate_key, hash_key


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


def test_generate_key_has_prefix():
    assert generate_key().startswith(KEY_PREFIX)


def test_generate_key_is_unique():
    assert generate_key() != generate_key()


def test_hash_key_is_deterministic():
    key = generate_key()
    assert hash_key(key) == hash_key(key)


def test_hash_key_differs_for_different_keys():
    assert hash_key(generate_key()) != hash_key(generate_key())


def test_encrypt_decrypt_round_trip():
    key = generate_key()
    ciphertext = encrypt_key(key)
    assert ciphertext != key
    assert decrypt_key(ciphertext) == key
