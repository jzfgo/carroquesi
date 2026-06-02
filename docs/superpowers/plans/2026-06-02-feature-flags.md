# Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user feature toggles backed by Postgres, starting with gating `ai_receipt_scanning` behind an admin-granted flag.

**Architecture:** A `user_features` table stores per-user overrides; a Python registry defines flag names and defaults. `is_admin` is a transient Python attribute read from the Firebase JWT custom claim — never stored in the DB. The frontend seeds flag state from `POST /auth/sync` at login, then polls `GET /users/me` every 60 s.

**Tech Stack:** FastAPI + SQLModel (backend), React + TypeScript (frontend), pytest (backend tests), Vitest + Testing Library (frontend tests)

---

## File Map

**Backend — new:**
- `backend/app/services/feature_flags.py` — `FlagDef`, `REGISTRY`, `is_enabled`, `get_enabled_flags`
- `backend/app/routers/admin.py` — `PATCH /admin/users/{user_id}/features`
- `backend/tests/test_feature_flags.py` — service unit tests
- `backend/tests/test_admin.py` — admin endpoint tests
- `backend/scripts/set_admin.py` — set Firebase custom claim `is_admin` on a user
- `backend/scripts/manage_feature.py` — direct-DB flag enable/disable/reset

**Backend — modified:**
- `backend/app/db/models.py` — add `UserFeature`
- `backend/app/schemas/auth.py` — add `features: list[str]` to `UserRead`
- `backend/app/dependencies.py` — attach `user.is_admin` from JWT; `X-Dev-Is-Admin` header; add `require_admin`
- `backend/app/routers/auth.py` — extend `POST /auth/sync`; add `GET /users/me`
- `backend/app/routers/receipt.py` — add feature flag guard at `POST /lists/{list_id}/receipt`
- `backend/app/main.py` — register admin router
- `backend/tests/conftest.py` — add `admin_user`/`admin_client` fixtures; include admin router in `_make_client`
- `backend/tests/test_auth.py` — assert `features` field in sync response
- `backend/tests/test_receipt_router.py` — add flag-gated 403 test
- `backend/scripts/seed.py` — add `UserFeature` rows + `_delete_seed_rows` cleanup
- `backend/justfile` — add `set-admin` and `feature` recipes

**Frontend — new:**
- `frontend/src/lib/featureFlags.ts` — `FLAGS` constants
- `frontend/src/contexts/FeatureFlagsContext.tsx` — provider + `useFeatureFlags` hook
- `frontend/src/contexts/FeatureFlagsContext.test.tsx` — context tests

**Frontend — modified:**
- `frontend/src/contexts/AuthContext.tsx` — `features: string[]` on `AuthUser`; populate from `syncUser` response
- `frontend/src/lib/api.ts` — add `getMe`
- `frontend/src/App.tsx` — nest `FeatureFlagsProvider` inside `AuthProvider`
- `frontend/src/components/ListScreen.tsx` — gate receipt scan CTA behind flag
- `frontend/src/components/ListScreen.test.tsx` — mock `useFeatureFlags`; add CTA visibility tests

**Docs + migration:**
- `CLAUDE.md` — update Core Data Model, auth dependencies, dev bypass, backend commands; add Feature Flag Management section
- `TODO.md` — remove Feature flags entry
- `backend/alembic/versions/XXXX_add_user_features.py` — **generated last, after rebasing on main**

---

### Task 1: UserFeature model + feature flags service

**Files:**
- Create: `backend/app/services/feature_flags.py`
- Modify: `backend/app/db/models.py`
- Test: `backend/tests/test_feature_flags.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_feature_flags.py`:

```python
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db.models import User, UserFeature
from app.services.feature_flags import get_enabled_flags, is_enabled


@pytest.fixture(name="engine")
def engine_fixture():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    yield eng
    SQLModel.metadata.drop_all(eng)


@pytest.fixture(name="session")
def session_fixture(engine):
    with Session(engine) as s:
        yield s


@pytest.fixture(name="user")
def user_fixture(session):
    u = User(firebase_uid="uid-ff-test", email="fftest@example.com")
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def test_is_enabled_no_row_falls_back_to_registry_default(session, user):
    # ai_receipt_scanning default=False in registry
    assert is_enabled(user.id, "ai_receipt_scanning", session) is False


def test_is_enabled_with_enabled_row(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=True, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert is_enabled(user.id, "ai_receipt_scanning", session) is True


def test_is_enabled_with_disabled_row(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=False, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert is_enabled(user.id, "ai_receipt_scanning", session) is False


def test_is_enabled_unknown_flag_returns_false(session, user):
    assert is_enabled(user.id, "nonexistent_flag", session) is False


def test_get_enabled_flags_no_rows_returns_empty(session, user):
    assert get_enabled_flags(user.id, session) == []


def test_get_enabled_flags_returns_enabled_flag_names(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=True, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert get_enabled_flags(user.id, session) == ["ai_receipt_scanning"]


def test_get_enabled_flags_excludes_disabled_rows(session, user):
    row = UserFeature(
        user_id=user.id, feature="ai_receipt_scanning", enabled=False, granted_by="admin"
    )
    session.add(row)
    session.commit()
    assert get_enabled_flags(user.id, session) == []
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /path/to/worktree && just backend test-file tests/test_feature_flags.py
```

Expected: ImportError or similar — `UserFeature` and `feature_flags` module don't exist yet.

- [ ] **Step 3: Add `UserFeature` to models.py**

Open `backend/app/db/models.py`. After the existing `FeedbackSubmission` class, add:

```python
class UserFeature(SQLModel, table=True):
    __tablename__ = "user_features"
    __table_args__ = (UniqueConstraint("user_id", "feature"),)

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    feature: str
    enabled: bool = True
    granted_by: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 4: Create `backend/app/services/feature_flags.py`**

```python
from dataclasses import dataclass, field

from sqlmodel import Session, select

from app.db.models import UserFeature


@dataclass(frozen=True)
class FlagDef:
    name: str
    default: bool
    description: str = ""


REGISTRY: dict[str, FlagDef] = {
    f.name: f
    for f in [
        FlagDef("ai_receipt_scanning", default=False, description="Gemini receipt scanning"),
    ]
}


def is_enabled(user_id: str, feature: str, session: Session) -> bool:
    row = session.exec(
        select(UserFeature).where(
            UserFeature.user_id == user_id,
            UserFeature.feature == feature,
        )
    ).first()
    if row is not None:
        return row.enabled
    return REGISTRY.get(feature, FlagDef(feature, default=False)).default


def get_enabled_flags(user_id: str, session: Session) -> list[str]:
    return [name for name in REGISTRY if is_enabled(user_id, name, session)]
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
just backend test-file tests/test_feature_flags.py
```

Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/models.py backend/app/services/feature_flags.py backend/tests/test_feature_flags.py
git commit -m "feat: add UserFeature model and feature flags service"
```

---

### Task 2: `is_admin` on `get_current_user` + `require_admin` dependency

**Files:**
- Modify: `backend/app/dependencies.py`

- [ ] **Step 1: Update `get_current_user` in `backend/app/dependencies.py`**

Replace the entire file content (preserve all existing logic, add the highlighted sections):

```python
from typing import Annotated, Any, Optional, TypeAlias

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.config import settings
from app.core.firebase import verify_id_token
from app.db.models import List, ListMember, User
from app.db.session import get_session

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    x_dev_user_id: Annotated[Optional[str], Header()] = None,
    x_dev_is_admin: Annotated[Optional[str], Header()] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> User:
    if settings.dev_auth_bypass and x_dev_user_id:
        user = session.exec(select(User).where(User.firebase_uid == x_dev_user_id)).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Dev bypass: no user with firebase_uid={x_dev_user_id!r}",
            )
        user.is_admin = x_dev_is_admin == "true"
        return user

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        decoded: dict[str, Any] = verify_id_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = session.exec(select(User).where(User.firebase_uid == decoded["uid"])).first()
    if user is None:
        user = User(
            firebase_uid=decoded["uid"],
            email=decoded.get("email", ""),
            display_name=decoded.get("name"),
            photo_url=decoded.get("picture"),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

    user.is_admin = decoded.get("is_admin", False)
    return user


CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]
CurrentSession: TypeAlias = Annotated[Session, Depends(get_session)]


def require_member(
    list_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
) -> tuple[List, User]:
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    membership = session.exec(
        select(ListMember).where(
            ListMember.list_id == list_id, ListMember.user_id == current_user.id
        )
    ).first()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    return lst, current_user


def require_owner(
    list_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
) -> tuple[List, User]:
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if lst.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner")
    return lst, current_user


def require_admin(current_user: CurrentUser) -> User:
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return current_user


MemberDep: TypeAlias = Annotated[tuple[List, User], Depends(require_member)]
OwnerDep: TypeAlias = Annotated[tuple[List, User], Depends(require_owner)]
AdminUser: TypeAlias = Annotated[User, Depends(require_admin)]
```

- [ ] **Step 2: Run existing tests to verify nothing broke**

```bash
just backend test
```

Expected: all pass (the new `x_dev_is_admin` header is optional, so existing bypass tests are unaffected).

- [ ] **Step 3: Commit**

```bash
git add backend/app/dependencies.py
git commit -m "feat: attach is_admin from JWT; add require_admin dependency"
```

---

### Task 3: `UserRead` schema + `POST /auth/sync` + `GET /users/me`

**Files:**
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Write failing test for features in sync response**

Open `backend/tests/test_auth.py`. Add at the end:

```python
def test_sync_returns_features_list(session: Session, client: TestClient, user: User):
    response = client.post("/auth/sync")
    assert response.status_code == 200
    data = response.json()
    assert "features" in data
    assert isinstance(data["features"], list)


def test_users_me_returns_features(session: Session, client: TestClient, user: User):
    response = client.get("/users/me")
    assert response.status_code == 200
    data = response.json()
    assert "features" in data
    assert isinstance(data["features"], list)
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
just backend test-file tests/test_auth.py
```

Expected: `test_sync_returns_features_list` fails because `features` not in response; `test_users_me_returns_features` fails with 404 (endpoint doesn't exist).

- [ ] **Step 3: Update `UserRead` schema**

Replace `backend/app/schemas/auth.py`:

```python
from pydantic import BaseModel


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str | None
    photo_url: str | None
    features: list[str] = []
```

- [ ] **Step 4: Update `backend/app/routers/auth.py`**

Replace the file:

```python
from fastapi import APIRouter

from app.dependencies import CurrentSession, CurrentUser
from app.schemas.auth import UserRead
from app.services import feature_flags

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_read(user, session) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        photo_url=user.photo_url,
        features=feature_flags.get_enabled_flags(user.id, session),
    )


@router.post("/sync", response_model=UserRead)
def sync_user(current_user: CurrentUser, session: CurrentSession):
    """Called by the frontend immediately after Firebase login."""
    return _user_read(current_user, session)


@router.get("/users/me", response_model=UserRead)
def get_me(current_user: CurrentUser, session: CurrentSession):
    """Polled by the frontend every 60 s to pick up flag changes mid-session."""
    return _user_read(current_user, session)
```

Note: `GET /users/me` lives in the auth router (prefix `/auth` is not used here since the path is `/users/me`). The prefix `/auth` would make it `/auth/users/me`, which is wrong. Change the router prefix to avoid conflict.

**Fix:** Remove the prefix from the `GET /users/me` route by using a separate APIRouter with no prefix, or by adjusting the path. Looking at the existing setup, the auth router has `prefix="/auth"` so `POST /sync` becomes `POST /auth/sync`. But `GET /users/me` should be at `/users/me` without the `/auth` prefix.

The cleanest approach: register `GET /users/me` on a separate router with no prefix, or override the path with an absolute route. FastAPI doesn't support absolute paths directly, so use a second router.

Replace `backend/app/routers/auth.py` with:

```python
from fastapi import APIRouter

from app.dependencies import CurrentSession, CurrentUser
from app.schemas.auth import UserRead
from app.services import feature_flags

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(tags=["users"])


def _user_read(user, session) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        photo_url=user.photo_url,
        features=feature_flags.get_enabled_flags(user.id, session),
    )


@router.post("/sync", response_model=UserRead)
def sync_user(current_user: CurrentUser, session: CurrentSession):
    """Called by the frontend immediately after Firebase login."""
    return _user_read(current_user, session)


@users_router.get("/users/me", response_model=UserRead)
def get_me(current_user: CurrentUser, session: CurrentSession):
    """Polled by the frontend every 60 s to pick up flag changes mid-session."""
    return _user_read(current_user, session)
```

- [ ] **Step 5: Register `users_router` in `backend/app/main.py`**

Open `backend/app/main.py`. Change the import line and add the new router:

```python
from app.routers import auth, barcode, feedback, invites, items, lists, members, prices, receipt, share, suggestions
```

→

```python
from app.routers import auth, barcode, feedback, invites, items, lists, members, prices, receipt, share, suggestions
```

(import is the same module, just register the extra router)

After `app.include_router(auth.router)`, add:

```python
app.include_router(auth.users_router)
```

- [ ] **Step 6: Register `users_router` in `conftest._make_client` as well**

Open `backend/tests/conftest.py`. In `_make_client`, after `test_app.include_router(auth.router)`, add:

```python
test_app.include_router(auth.users_router)
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
just backend test-file tests/test_auth.py
```

Expected: all pass, including the two new tests.

- [ ] **Step 8: Run full suite**

```bash
just backend test
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/routers/auth.py backend/app/main.py backend/tests/conftest.py backend/tests/test_auth.py
git commit -m "feat: add features list to UserRead; add GET /users/me"
```

---

### Task 4: Admin router + tests

**Files:**
- Create: `backend/app/routers/admin.py`
- Create: `backend/tests/test_admin.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_admin.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import User, UserFeature
from tests.conftest import _make_client


@pytest.fixture(name="admin_user")
def admin_user_fixture(session: Session) -> User:
    u = User(firebase_uid="uid-admin", display_name="Admin", email="admin@example.com")
    session.add(u)
    session.commit()
    session.refresh(u)
    u.is_admin = True  # transient — not persisted, mimics JWT custom claim
    return u


@pytest.fixture(name="admin_client")
def admin_client_fixture(session: Session, admin_user: User):
    client = _make_client(session, admin_user)
    with client:
        yield client


def test_patch_features_requires_admin(client: TestClient, other_user: User):
    response = client.patch(
        f"/admin/users/{other_user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    assert response.status_code == 403


def test_patch_features_enables_flag(
    admin_client: TestClient, session: Session, user: User
):
    response = admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert "ai_receipt_scanning" in data["features"]

    row = session.exec(
        select(UserFeature).where(
            UserFeature.user_id == user.id,
            UserFeature.feature == "ai_receipt_scanning",
        )
    ).first()
    assert row is not None
    assert row.enabled is True


def test_patch_features_disables_flag(
    admin_client: TestClient, session: Session, user: User
):
    # First enable
    session.add(
        UserFeature(user_id=user.id, feature="ai_receipt_scanning", enabled=True, granted_by="admin")
    )
    session.commit()

    response = admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert "ai_receipt_scanning" not in data["features"]


def test_patch_features_upserts_not_duplicates(
    admin_client: TestClient, session: Session, user: User
):
    from sqlmodel import select

    admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "ai_receipt_scanning", "enabled": False},
    )

    rows = session.exec(
        select(UserFeature).where(
            UserFeature.user_id == user.id,
            UserFeature.feature == "ai_receipt_scanning",
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].enabled is False


def test_patch_features_unknown_flag_returns_422(
    admin_client: TestClient, user: User
):
    response = admin_client.patch(
        f"/admin/users/{user.id}/features",
        json={"feature": "unknown_flag", "enabled": True},
    )
    assert response.status_code == 422


def test_patch_features_unknown_user_returns_404(
    admin_client: TestClient,
):
    response = admin_client.patch(
        "/admin/users/no-such-user/features",
        json={"feature": "ai_receipt_scanning", "enabled": True},
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
just backend test-file tests/test_admin.py
```

Expected: ImportError or 404 — the admin router doesn't exist yet.

- [ ] **Step 3: Create `backend/app/routers/admin.py`**

```python
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from app.db.models import User, UserFeature
from app.dependencies import AdminUser, CurrentSession
from app.services import feature_flags

router = APIRouter(prefix="/admin", tags=["admin"])


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


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
```

- [ ] **Step 4: Register admin router in `main.py`**

Open `backend/app/main.py`. Add to imports:

```python
from app.routers import admin, auth, barcode, feedback, invites, items, lists, members, prices, receipt, share, suggestions
```

After `app.include_router(auth.users_router)`, add:

```python
app.include_router(admin.router)
```

- [ ] **Step 5: Add admin router to `_make_client` in conftest.py**

Open `backend/tests/conftest.py`. In `_make_client`, in the import block inside the function add:

```python
from app.routers import admin
```

And add after `test_app.include_router(auth.users_router)`:

```python
test_app.include_router(admin.router)
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
just backend test-file tests/test_admin.py
```

Expected: all 7 tests pass.

- [ ] **Step 7: Run full suite**

```bash
just backend test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/admin.py backend/app/main.py backend/tests/conftest.py backend/tests/test_admin.py
git commit -m "feat: add PATCH /admin/users/{user_id}/features endpoint"
```

---

### Task 5: Receipt endpoint feature flag guard

**Files:**
- Modify: `backend/app/routers/receipt.py`
- Modify: `backend/tests/test_receipt_router.py`

- [ ] **Step 1: Write failing test**

Open `backend/tests/test_receipt_router.py`. At the end, add:

```python
def test_post_receipt_returns_403_when_flag_disabled(client):
    # Flag is off by default (no UserFeature row) — receipt endpoint should be gated
    response = client.post(f"/lists/{LIST_ID}/receipt", json=_unit_body())
    assert response.status_code == 403
```

Wait — this will **conflict** with the existing `test_post_receipt_returns_scan_result` test which expects 200. Once you add the guard, the existing passing tests will start failing because the seed user doesn't have the flag enabled.

The right approach: all receipt tests need the flag enabled for the test user. Add a fixture that inserts a `UserFeature` row enabling `ai_receipt_scanning` for the test user, and make it `autouse=True` for the existing tests. Then add a separate test that explicitly has no `UserFeature` row.

Here is the approach:

Add a helper fixture and update the existing `seed_list` fixture to also enable the flag:

```python
# Add near the top of test_receipt_router.py, after existing imports:
from app.db.models import UserFeature
from app.services.feature_flags import REGISTRY  # noqa: F401 (confirms import)


@pytest.fixture(autouse=True)
def enable_receipt_flag(session, user):
    """Enable ai_receipt_scanning for the test user so existing tests keep passing."""
    row = UserFeature(
        user_id=user.id,
        feature="ai_receipt_scanning",
        enabled=True,
        granted_by="admin",
    )
    session.add(row)
    session.commit()
```

And add the 403 test using a **second client** whose user has no flag:

```python
def test_post_receipt_returns_403_when_flag_disabled(session, other_user, other_client):
    # other_user has no UserFeature row; flag defaults to False
    from app.db.models import List, ListMember

    lst = List(id="list-receipt-other", name="Other List", owner_id=other_user.id)
    mem = ListMember(list_id="list-receipt-other", user_id=other_user.id)
    session.add_all([lst, mem])
    session.commit()

    response = other_client.post("/lists/list-receipt-other/receipt", json=_unit_body())
    assert response.status_code == 403
```

- [ ] **Step 2: Run tests — verify new test fails, existing pass**

```bash
just backend test-file tests/test_receipt_router.py
```

Expected: `test_post_receipt_returns_403_when_flag_disabled` passes trivially (returns 200, not 403) — wait, no: there's no guard yet so it returns 200 when it should return 403. The test fails.

- [ ] **Step 3: Add guard to receipt endpoint**

Open `backend/app/routers/receipt.py`. Add to the imports at the top:

```python
from app.services import feature_flags
```

At the top of `scan_receipt`, after `_, current_user = list_and_user`, add:

```python
    if not feature_flags.is_enabled(current_user.id, "ai_receipt_scanning", session):
        from fastapi import status as http_status
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="ai_receipt_scanning feature not enabled",
        )
```

The full updated top of `scan_receipt`:

```python
@router.post("/lists/{list_id}/receipt", response_model=ReceiptScanResult)
def scan_receipt(
    list_id: str,
    body: ReceiptScanRequest,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user

    if not feature_flags.is_enabled(current_user.id, "ai_receipt_scanning", session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ai_receipt_scanning feature not enabled",
        )

    # ... rest of the function unchanged ...
```

Also add `status` to the existing FastAPI imports at the top of the file:

```python
from fastapi import APIRouter, HTTPException, status
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
just backend test-file tests/test_receipt_router.py
```

Expected: all pass, including the new 403 test.

- [ ] **Step 5: Run full suite**

```bash
just backend test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/receipt.py backend/tests/test_receipt_router.py
git commit -m "feat: gate POST /lists/{list_id}/receipt behind ai_receipt_scanning flag"
```

---

### Task 6: Seed data + management scripts + justfile

**Files:**
- Modify: `backend/scripts/seed.py`
- Create: `backend/scripts/set_admin.py`
- Create: `backend/scripts/manage_feature.py`
- Modify: `backend/justfile`

- [ ] **Step 1: Update `backend/scripts/seed.py`**

Add `UserFeature` to the import line:

```python
from app.db.models import BarcodeCache, List, ListInvite, ListItem, ListMember, User, UserFeature
```

Add this constant after `SEED_BARCODES`:

```python
SEED_FEATURES = [
    # Alice gets receipt scanning — tests the happy path
    UserFeature(
        id="seed-feat-alice-receipt",
        user_id=ALICE_ID,
        feature="ai_receipt_scanning",
        enabled=True,
        granted_by="admin",
    ),
    # Bob and Carol have no row — defaults to False (tests the gated state)
]
```

In `_delete_seed_rows`, add `UserFeature` to the list **before** `User` (FK dependency):

```python
def _delete_seed_rows(session: Session) -> None:
    for model, id_col in [
        (ListInvite,   ListInvite.id),
        (ListItem,     ListItem.id),
        (ListMember,   ListMember.id),
        (UserFeature,  UserFeature.id),   # ← new, before List/User
        (List,         List.id),
        (BarcodeCache, BarcodeCache.id),
        (User,         User.id),
    ]:
        rows = session.exec(select(model).where(id_col.startswith("seed-"))).all()
        for row in rows:
            session.delete(row)
    session.commit()
    print("  cleared existing seed rows")
```

In `main()`, after `_insert(session, SEED_BARCODES)`:

```python
        _insert(session, SEED_FEATURES);  print(f"  +{len(SEED_FEATURES)} feature flags")
```

- [ ] **Step 2: Verify seed runs cleanly (requires local DB with the migration — skip if migration not yet run)**

If the local DB already has the `user_features` table (from manual migration or a prior run):

```bash
just seed
```

Expected: runs without error, prints `+1 feature flags`.

If the table doesn't exist yet, skip this step — the migration in Task 12 will create it.

- [ ] **Step 3: Create `backend/scripts/set_admin.py`**

```python
#!/usr/bin/env python3
"""
Grant admin status to a Firebase user via custom claims.

Usage:
    uv run python scripts/set_admin.py <firebase_uid>

The user must refresh their Firebase ID token before the claim takes effect.
Firebase caches tokens for up to 1 hour. Force-refresh in the app or wait.
"""
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials

cred = credentials.Certificate(
    Path(__file__).parent.parent / "firebase-credentials.json"
)
firebase_admin.initialize_app(cred)

uid = sys.argv[1]
auth.set_custom_user_claims(uid, {"is_admin": True})
print(f"✓ Set is_admin=True for uid={uid!r}")
print("User must refresh their Firebase token (wait up to 1 hour, or force-refresh in the app).")
```

- [ ] **Step 4: Create `backend/scripts/manage_feature.py`**

```python
#!/usr/bin/env python3
"""
Direct-DB feature flag management (no running server required).

Usage:
    uv run python scripts/manage_feature.py <firebase_uid> <feature> <on|off|reset>

Actions:
    on    — upsert UserFeature with enabled=True
    off   — upsert UserFeature with enabled=False
    reset — delete the row (user reverts to registry default)
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select

from app.db.models import User, UserFeature
from app.db.session import engine
from app.services.feature_flags import REGISTRY


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    firebase_uid, feature, action = sys.argv[1], sys.argv[2], sys.argv[3]

    if feature not in REGISTRY:
        print(f"Unknown feature {feature!r}. Known flags: {', '.join(REGISTRY)}")
        sys.exit(1)

    if action not in ("on", "off", "reset"):
        print(f"Unknown action {action!r}. Must be one of: on, off, reset")
        sys.exit(1)

    with Session(engine) as session:
        user = session.exec(select(User).where(User.firebase_uid == firebase_uid)).first()
        if user is None:
            print(f"No user with firebase_uid={firebase_uid!r}")
            sys.exit(1)

        row = session.exec(
            select(UserFeature).where(
                UserFeature.user_id == user.id,
                UserFeature.feature == feature,
            )
        ).first()

        if action == "reset":
            if row:
                session.delete(row)
                session.commit()
                print(f"✓ Deleted UserFeature row — {user.email} / {feature} now at registry default")
            else:
                print(f"No row to delete — {user.email} / {feature} already at registry default")
        else:
            enabled = action == "on"
            if row is None:
                row = UserFeature(
                    user_id=user.id,
                    feature=feature,
                    enabled=enabled,
                    granted_by="admin",
                )
                session.add(row)
            else:
                row.enabled = enabled
                row.updated_at = _now()
                session.add(row)
            session.commit()
            state = "enabled" if enabled else "disabled"
            print(f"✓ {user.email} / {feature} → {state}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Add recipes to `backend/justfile`**

Open `backend/justfile`. Add at the end:

```just
# Grant admin privileges to a user (usage: just backend set-admin <firebase_uid>)
set-admin uid:
    uv run python scripts/set_admin.py {{uid}}

# Manage a feature flag for a user (usage: just backend feature <firebase_uid> <flag> <on|off|reset>)
feature uid flag action:
    uv run python scripts/manage_feature.py {{uid}} {{flag}} {{action}}
```

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/seed.py backend/scripts/set_admin.py backend/scripts/manage_feature.py backend/justfile
git commit -m "feat: seed UserFeature rows; add set_admin and manage_feature scripts"
```

---

### Task 7: Frontend — `featureFlags.ts` constants + `AuthContext` + `api.ts`

**Files:**
- Create: `frontend/src/lib/featureFlags.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create `frontend/src/lib/featureFlags.ts`**

```typescript
export const FLAGS = {
  AI_RECEIPT_SCANNING: 'ai_receipt_scanning',
} as const
```

- [ ] **Step 2: Add `getMe` to `frontend/src/lib/api.ts`**

Open `frontend/src/lib/api.ts`. After the `syncUser` function, add:

```typescript
export function getMe(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/users/me')
}
```

- [ ] **Step 3: Update `AuthUser` and `AuthContext` to include `features`**

Open `frontend/src/contexts/AuthContext.tsx`.

Change the `AuthUser` interface (line 20–25):

```typescript
export interface AuthUser {
  id: string
  displayName: string
  photoUrl: string | null
  email: string
  features: string[]
}
```

In the dev bypass path (lines 55–62), change the `setUser` call:

```typescript
syncUser(getToken)
  .then((data) => {
    const d = data as { id: string; display_name: string; photo_url: string | null; email: string; features?: string[] }
    setUser({ id: d.id, displayName: d.display_name, photoUrl: d.photo_url, email: d.email, features: d.features ?? [] })
  })
```

In the Firebase path (lines 70–78), change the `setUser` call:

```typescript
const data = await syncUser(getToken) as {
  id: string
  display_name: string
  photo_url: string | null
  email: string
  features?: string[]
}
setUser({
  id: data.id,
  displayName: data.display_name,
  photoUrl: data.photo_url,
  email: data.email,
  features: data.features ?? [],
})
```

- [ ] **Step 4: Run frontend typecheck**

```bash
just frontend typecheck
```

Expected: no errors.

- [ ] **Step 5: Run frontend tests**

```bash
just frontend test
```

Expected: all pass. (Existing tests that mock `useAuth` with a user object will need `features: []` added to those mock objects. If any fail with a type error, add `features: []` to the mock return values in the failing test files.)

If tests fail, search for `useAuth` mocks:

```bash
grep -r "useAuth.*mockReturnValue\|mockReturnValue.*useAuth" frontend/src --include="*.test.*" -l
```

In each failing file, find the mock user object and add `features: []`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/featureFlags.ts frontend/src/lib/api.ts frontend/src/contexts/AuthContext.tsx
git commit -m "feat: add FLAGS constants; add features to AuthUser; add getMe API call"
```

---

### Task 8: `FeatureFlagsContext` + tests

**Files:**
- Create: `frontend/src/contexts/FeatureFlagsContext.tsx`
- Create: `frontend/src/contexts/FeatureFlagsContext.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/contexts/FeatureFlagsContext.test.tsx`:

```typescript
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureFlagsProvider, useFeatureFlags } from './FeatureFlagsContext'
import * as AuthContext from './AuthContext'
import * as api from '../lib/api'

vi.mock('./AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return { ...actual, useAuth: vi.fn() }
})
vi.mock('../lib/api')

const mockGetToken = vi.fn().mockResolvedValue('token')

function TestConsumer({ flag }: { flag: string }) {
  const { isEnabled } = useFeatureFlags()
  return <div>{isEnabled(flag) ? 'enabled' : 'disabled'}</div>
}

function makeUser(features: string[] = []) {
  return {
    id: 'u1',
    displayName: 'Alice',
    photoUrl: null,
    email: 'alice@example.com',
    features,
  }
}

describe('FeatureFlagsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: makeUser(),
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for a flag listed in user.features', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: makeUser(['ai_receipt_scanning']),
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })
    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('enabled')).toBeInTheDocument()
  })

  it('returns false for a flag not in user.features', () => {
    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('returns false for a null user', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })
    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('polls GET /users/me every 60 s and updates flags', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ features: ['ai_receipt_scanning'] } as never)

    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('disabled')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    expect(screen.getByText('enabled')).toBeInTheDocument()
  })

  it('stops polling after sign-out (user becomes null)', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ features: ['ai_receipt_scanning'] } as never)

    const { rerender } = render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )

    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })

    rerender(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    // getMe should NOT have been called after sign-out
    expect(vi.mocked(api.getMe)).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm run test -- src/contexts/FeatureFlagsContext.test.tsx
```

Expected: module not found errors.

- [ ] **Step 3: Create `frontend/src/contexts/FeatureFlagsContext.tsx`**

```typescript
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { getMe } from '../lib/api'

interface FeatureFlagsContextValue {
  isEnabled: (flag: string) => boolean
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useFeatureFlags(): FeatureFlagsContextValue {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider')
  return ctx
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth()
  const [flags, setFlags] = useState<string[]>(user?.features ?? [])

  useEffect(() => {
    setFlags(user?.features ?? [])
  }, [user])

  useEffect(() => {
    if (!user) return

    const poll = async () => {
      try {
        const data = await getMe(getToken) as { features?: string[] }
        setFlags(data.features ?? [])
      } catch {
        // keep last known state on error
      }
    }

    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  }, [user, getToken])

  const isEnabled = useCallback((flag: string) => flags.includes(flag), [flags])

  return (
    <FeatureFlagsContext.Provider value={{ isEnabled }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npm run test -- src/contexts/FeatureFlagsContext.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/FeatureFlagsContext.tsx frontend/src/contexts/FeatureFlagsContext.test.tsx
git commit -m "feat: add FeatureFlagsContext with 60s polling"
```

---

### Task 9: Wire provider + gate receipt scan CTA in `ListScreen`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ListScreen.tsx`
- Modify: `frontend/src/components/ListScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Open `frontend/src/components/ListScreen.test.tsx`.

Add to the `vi.mock` block at the top (after the existing mocks):

```typescript
import * as FeatureFlagsContextModule from '../contexts/FeatureFlagsContext'
vi.mock('../contexts/FeatureFlagsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof FeatureFlagsContextModule>()
  return { ...actual, useFeatureFlags: vi.fn() }
})
```

In the `beforeEach`, add a default mock for `useFeatureFlags`:

```typescript
vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
  isEnabled: () => true,
})
```

Add these two new tests at the end of the file (or within an appropriate describe block):

```typescript
const PURCHASED_ITEM: ListItem = {
  id: 'i1',
  list_id: 'list1',
  name: 'Leche',
  quantity: '1',
  purchased_quantity: null,
  brand: null,
  stores: [],
  purchased: true,
  purchased_at: TODAY,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: TODAY,
  updated_at: TODAY,
}

it('shows receipt scan CTA when all items are purchased and flag is enabled', () => {
  vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({ isEnabled: () => true })
  vi.mocked(useListItemsModule.useListItems).mockReturnValue({
    ...emptyHookResult,
    items: [PURCHASED_ITEM],
  })
  render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
  expect(screen.getByText(/Escanear ticket/)).toBeInTheDocument()
})

it('hides receipt scan CTA when flag is disabled', () => {
  vi.mocked(FeatureFlagsContextModule.useFeatureFlagsContext.useFeatureFlags).mockReturnValue({
    isEnabled: () => false,
  })
  vi.mocked(useListItemsModule.useListItems).mockReturnValue({
    ...emptyHookResult,
    items: [PURCHASED_ITEM],
  })
  render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
  expect(screen.queryByText(/Escanear ticket/)).not.toBeInTheDocument()
})
```

Wait — fix the typo in the test. Both tests should use `FeatureFlagsContextModule.useFeatureFlags`:

```typescript
it('hides receipt scan CTA when flag is disabled', () => {
  vi.mocked(FeatureFlagsContextModule.useFeatureFlags).mockReturnValue({
    isEnabled: () => false,
  })
  vi.mocked(useListItemsModule.useListItems).mockReturnValue({
    ...emptyHookResult,
    items: [PURCHASED_ITEM],
  })
  render(<ListScreen listId="list1" listName="Test" listOwnerId="u1" />)
  expect(screen.queryByText(/Escanear ticket/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd frontend && npm run test -- src/components/ListScreen.test.tsx
```

Expected: new tests fail (ListScreen doesn't call `useFeatureFlags` yet, so the CTA shows regardless of flag state).

- [ ] **Step 3: Add `useFeatureFlags` import and gate the CTA in `ListScreen.tsx`**

Open `frontend/src/components/ListScreen.tsx`.

Add to the imports (after `import { useAuth } from "../contexts/AuthContext"`):

```typescript
import { useFeatureFlags } from "../contexts/FeatureFlagsContext"
import { FLAGS } from "../lib/featureFlags"
```

After the `const { getToken, user } = useAuth()` line, add:

```typescript
  const { isEnabled } = useFeatureFlags()
```

Find the `footer` prop (around line 564). Change from:

```typescript
footer={allUnpurchasedCount === 0 && items.length > 0 && !receiptScanResult ? (
  <div className="receipt-scan-cta">
    ...
  </div>
) : undefined}
```

To:

```typescript
footer={
  allUnpurchasedCount === 0 &&
  items.length > 0 &&
  !receiptScanResult &&
  isEnabled(FLAGS.AI_RECEIPT_SCANNING) ? (
    <div className="receipt-scan-cta">
      <button
        className="receipt-scan-cta__btn"
        onClick={handleReceiptScan}
        disabled={receiptUploading || isOffline}
      >
        {receiptUploading ? "Procesando ticket…" : <><Receipt size={16} /> Escanear ticket para registrar precios</>}
      </button>
    </div>
  ) : undefined
}
```

- [ ] **Step 4: Run typecheck**

```bash
just frontend typecheck
```

Expected: no errors.

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd frontend && npm run test -- src/components/ListScreen.test.tsx
```

Expected: all pass including the two new tests.

- [ ] **Step 6: Wire `FeatureFlagsProvider` in `App.tsx`**

Open `frontend/src/App.tsx`. Add import:

```typescript
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext'
```

In the `App` function, wrap the `AuthProvider` children with `FeatureFlagsProvider`:

```typescript
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeatureFlagsProvider>
          <ThemeManager>
            <Routes>
              <Route path="/invite/:id" element={<InviteScreen />} />
              <Route path="/lists/:id" element={<AuthRoute element={<ListRoute />} />} />
              <Route path="*" element={<AppContent />} />
            </Routes>
          </ThemeManager>
        </FeatureFlagsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 7: Run full frontend suite**

```bash
just frontend test
```

Expected: all pass.

- [ ] **Step 8: Run lint**

```bash
just frontend lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/ListScreen.tsx frontend/src/components/ListScreen.test.tsx
git commit -m "feat: gate receipt scan CTA behind ai_receipt_scanning flag"
```

---

### Task 10: Docs — CLAUDE.md + TODO.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `TODO.md`

- [ ] **Step 1: Update Core Data Model section in CLAUDE.md**

In the `## Core Data Model` bullet list, add:

```
- `user_features`: per-user feature flag overrides; `feature` must match a key in the flag registry in `backend/app/services/feature_flags.py`
```

- [ ] **Step 2: Update auth dependencies list in CLAUDE.md**

In the `### Key conventions` section of the Backend, find the line about auth dependencies:

```
- Auth dependency in `backend/app/dependencies.py`: `get_current_user`, `require_member`, `require_owner`
```

Change to:

```
- Auth dependency in `backend/app/dependencies.py`: `get_current_user`, `require_member`, `require_owner`, `require_admin`
- `is_admin` is a transient Python attribute on `User`, read from Firebase JWT custom claim `decoded.get("is_admin", False)` — never stored in the DB
```

- [ ] **Step 3: Update dev auth bypass section in CLAUDE.md**

Find the dev auth bypass paragraph. Add to the end:

```
Add `X-Dev-Is-Admin: true` to the request header to also mark the dev user as admin. Only honoured when `DEV_AUTH_BYPASS=true`.
```

- [ ] **Step 4: Add `just backend set-admin` and `just backend feature` to backend commands in CLAUDE.md**

In the backend commands block, add:

```bash
just backend set-admin <firebase_uid>              # grant admin (Firebase custom claim)
just backend feature <firebase_uid> <flag> on|off|reset  # enable/disable/reset a flag
```

- [ ] **Step 5: Add Feature Flag Management section to CLAUDE.md**

After the existing backend Key conventions, add a new section:

```markdown
### Feature Flag Management

- **Registry** — all known flags and defaults live in `backend/app/services/feature_flags.py`. Adding a flag = one `FlagDef` entry in `REGISTRY`.
- **Adding a new flag**: add `FlagDef` to `REGISTRY` + add constant to `frontend/src/lib/featureFlags.ts` + seed test data in `scripts/seed.py` + add tests + gate the endpoint/UI
- **Granting/revoking**: `just backend feature <firebase_uid> <flag> on|off|reset`
- **Setting admin**: `just backend set-admin <firebase_uid>` — sets Firebase custom claim; user must refresh their token (up to 1 hour wait, or force-refresh in the app)
```

- [ ] **Step 6: Remove Feature flags from TODO.md**

Open `TODO.md`. Find and remove the Feature flags entry (exact wording may vary).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md TODO.md
git commit -m "docs: update CLAUDE.md with feature flag details; remove from TODO"
```

---

### Task 11: Run `just ci` and fix any remaining issues

- [ ] **Step 1: Run full CI check**

```bash
just ci
```

Expected: frontend typecheck + lint + backend tests all pass.

- [ ] **Step 2: Fix any failures**

If `ListScreen.test.tsx` fails because other test files have `useAuth` mocks missing `features`:

```bash
grep -r "useAuth.*mockReturnValue" frontend/src --include="*.test.*" -l
```

In each file, add `features: []` to any user object in the mock return value.

- [ ] **Step 3: Commit any fixes**

```bash
git add -p
git commit -m "fix: add features field to useAuth mocks in tests"
```

---

### Task 12: Alembic migration (LAST — after rebasing on main)

> **Do this task last, after rebasing the branch on main and confirming no other branch has a pending migration.**

- [ ] **Step 1: Confirm you are on the feature branch worktree, not main**

```bash
git branch --show-current
```

Expected: `feat/feature-flags`

- [ ] **Step 2: Rebase on main**

```bash
git fetch origin
git rebase origin/main
```

Resolve any conflicts if they appear.

- [ ] **Step 3: Generate the migration**

```bash
just backend migration "add user_features table"
```

This creates a file at `backend/alembic/versions/<hash>_add_user_features_table.py`.

- [ ] **Step 4: Inspect the generated migration**

Open the generated file and verify it contains something like:

```python
def upgrade() -> None:
    op.create_table(
        "user_features",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("feature", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("granted_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "feature"),
    )
    op.create_index(op.f("ix_user_features_user_id"), "user_features", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_user_features_user_id"), table_name="user_features")
    op.drop_table("user_features")
```

If the auto-generated migration looks correct, proceed.

- [ ] **Step 5: Run the migration locally**

```bash
just backend migrate
```

Expected: `Running upgrade ... -> <hash>, add user_features table`

- [ ] **Step 6: Run seed to verify it works end-to-end**

```bash
just seed
```

Expected: runs without error, prints `+1 feature flags`.

- [ ] **Step 7: Run full CI one more time**

```bash
just ci
```

Expected: all pass.

- [ ] **Step 8: Run changelog**

```bash
just changelog
```

- [ ] **Step 9: Commit migration + changelog**

```bash
git add backend/alembic/versions/ CHANGELOG.md
git commit -m "chore: add Alembic migration for user_features table; update changelog"
```

---

## Done Checklist

Before declaring done, verify:

- [ ] Worktree was active throughout (never on `main`)
- [ ] `just ci` passes (frontend typecheck + lint + backend tests)
- [ ] `TODO.md` — Feature flags entry removed
- [ ] `CHANGELOG.md` — `just changelog` run and committed
- [ ] Only intentional files changed (no `package-lock.json` native binding churn)
- [ ] Alembic migration is the **last** commit, after rebasing on main
