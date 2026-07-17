from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ApiKey, User


def test_download_returns_404_when_no_static_file_exists(client: TestClient, tmp_path, monkeypatch):
    # The signed artifact ships committed at backend/app/static/cqs.shortcut, so
    # point the router at a path that doesn't exist to exercise the missing-file
    # branch deterministically regardless of the real artifact's presence.
    monkeypatch.setattr("app.routers.shortcuts._SHORTCUT_PATH", tmp_path / "missing.shortcut")
    response = client.get("/shortcuts/cqs.shortcut")
    assert response.status_code == 404


def test_download_serves_the_static_file_when_present(client: TestClient, tmp_path, monkeypatch):
    fake_bytes = b"fake-shortcut-binary-content"
    fake_path = tmp_path / "cqs.shortcut"
    fake_path.write_bytes(fake_bytes)
    monkeypatch.setattr("app.routers.shortcuts._SHORTCUT_PATH", fake_path)

    response = client.get("/shortcuts/cqs.shortcut")

    assert response.status_code == 200
    assert response.content == fake_bytes
    # Imported name (and Siri trigger) comes from this filename — spaced/accented via
    # RFC 6266 filename*, with an ASCII filename fallback.
    assert response.headers["content-disposition"] == (
        'attachment; filename="Carro Que Si.shortcut"; '
        "filename*=UTF-8''Carro%20Que%20S%C3%AD.shortcut"
    )


def test_issue_creates_a_key_when_none_exists(client: TestClient, session: Session, user: User):
    response = client.post("/account/api-key")

    assert response.status_code == 200
    body = response.json()
    assert body["created"] is True
    assert body["key"].startswith("cqs_")

    from app.services.api_keys import hash_key

    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    assert api_key.key_hash == hash_key(body["key"])


def test_issue_is_idempotent_and_never_rotates_an_existing_key(
    client: TestClient, session: Session, user: User
):
    first = client.post("/account/api-key").json()
    stored_hash = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first().key_hash

    second = client.post("/account/api-key").json()

    assert second["created"] is False
    assert second["key"] is None
    # the existing key's hash is untouched — no rotation happened
    session.expire_all()
    assert (
        session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first().key_hash
        == stored_hash
    )
    assert first["key"].startswith("cqs_")


def test_regenerate_returns_the_plaintext_key_once(
    client: TestClient, session: Session, user: User
):
    response = client.post("/account/api-key/regenerate")

    assert response.status_code == 200
    body = response.json()
    assert "key" in body
    assert body["key"].startswith("cqs_")

    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    from app.services.api_keys import hash_key

    assert api_key.key_hash == hash_key(body["key"])


def test_regenerate_rotates_an_existing_key(client: TestClient, session: Session, user: User):
    first = client.post("/account/api-key/regenerate").json()
    second = client.post("/account/api-key/regenerate").json()

    assert first["key"] != second["key"]
    api_key = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).first()
    from app.services.api_keys import hash_key

    assert api_key.key_hash == hash_key(second["key"])
    # the old key no longer authenticates: `ApiKey.user_id` is unique, so
    # rotation overwrote the single row for this user — no row anywhere
    # still hashes to the stale plaintext. (Not exercised via HTTP here:
    # the shared `client` fixture overrides `get_current_user` directly,
    # so `X-Api-Key` headers are never actually checked through it — see
    # `test_api_key_auth.py` for the real end-to-end auth-path coverage.)
    stale_key_row = session.exec(
        select(ApiKey).where(ApiKey.key_hash == hash_key(first["key"]))
    ).first()
    assert stale_key_row is None
