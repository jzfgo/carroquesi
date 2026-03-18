# CarroQueSí Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full CarroQueSí REST API backend — database models, Alembic migrations, Firebase Auth JWT validation, and all CRUD endpoints for lists, items, members, invites, and suggestions.

**Architecture:** FastAPI application with SQLModel ORM on PostgreSQL. Firebase Admin SDK validates JWT tokens on every request (except the public invite preview endpoint). All write operations bump `lists.updated_at` in the same transaction to support short-polling sync. SQLite in-memory is used for tests — no Postgres required to run the test suite.

**Tech Stack:** Python 3.13, FastAPI, SQLModel, PostgreSQL, Alembic, firebase-admin, pytest, httpx

**Spec:** `docs/superpowers/specs/2026-03-18-api-data-model-design.md`

---

## File Map

```
backend/
├── app/
│   ├── main.py                          ← modify: include all routers
│   ├── core/
│   │   ├── config.py                    ← modify: add DATABASE_URL, FIREBASE_CREDENTIALS_PATH
│   │   └── firebase.py                  ← create: Firebase Admin SDK init + token verification
│   ├── db/
│   │   ├── __init__.py                  ← create: empty
│   │   ├── session.py                   ← create: engine, get_session dependency
│   │   └── models.py                    ← create: all SQLModel table models
│   ├── routers/
│   │   ├── __init__.py                  ← create: empty
│   │   ├── auth.py                      ← create: POST /auth/sync
│   │   ├── lists.py                     ← create: GET/POST /lists, GET/PATCH/DELETE /lists/{id}
│   │   ├── members.py                   ← create: GET/POST/DELETE /lists/{id}/members
│   │   ├── items.py                     ← create: GET/POST/PATCH/DELETE /lists/{id}/items[/{id}]
│   │   ├── invites.py                   ← create: GET/POST/DELETE invites, public preview
│   │   └── suggestions.py               ← create: GET /suggestions, GET /lists/{id}/updated-at
│   ├── schemas/
│   │   ├── __init__.py                  ← create: empty
│   │   ├── auth.py                      ← create: UserRead
│   │   ├── lists.py                     ← create: ListCreate, ListRead, ListUpdate
│   │   ├── members.py                   ← create: MemberRead, AddMemberRequest
│   │   ├── items.py                     ← create: ItemCreate, ItemRead, ItemUpdate
│   │   ├── invites.py                   ← create: InviteRead, InvitePreview, CreateInviteRequest
│   │   └── suggestions.py               ← create: SuggestionRead
│   └── dependencies.py                  ← create: get_current_user, require_member, require_owner
├── tests/
│   ├── conftest.py                      ← create: in-memory SQLite engine, test client, fixtures
│   ├── test_auth.py                     ← create
│   ├── test_lists.py                    ← create
│   ├── test_members.py                  ← create
│   ├── test_items.py                    ← create
│   ├── test_invites.py                  ← create
│   └── test_suggestions.py              ← create
└── alembic/
    ├── alembic.ini                      ← create
    ├── env.py                           ← create
    └── versions/
        └── 0001_initial_schema.py       ← create: initial migration
```

---

## Task 1: Add dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add runtime and dev dependencies**

```bash
cd backend
uv add sqlmodel alembic firebase-admin
uv add --dev pytest httpx pytest-asyncio
```

- [ ] **Step 2: Verify installation**

```bash
uv run python -c "import sqlmodel, alembic, firebase_admin; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "chore: add sqlmodel, alembic, firebase-admin, test deps"
```

---

## Task 2: Config and Firebase init

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/app/core/firebase.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Update config**

Replace `backend/app/core/config.py` with:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    allowed_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql://postgres:postgres@localhost:5432/carroquesi"
    firebase_credentials_path: str = "firebase-credentials.json"

    model_config = {"env_file": ".env"}


settings = Settings()
```

- [ ] **Step 2: Create Firebase init**

Create `backend/app/core/firebase.py`:

```python
import firebase_admin
from firebase_admin import auth, credentials

from app.core.config import settings

_app: firebase_admin.App | None = None


def get_firebase_app() -> firebase_admin.App:
    global _app
    if _app is None:
        cred = credentials.Certificate(settings.firebase_credentials_path)
        _app = firebase_admin.initialize_app(cred)
    return _app


def verify_id_token(id_token: str) -> dict:
    get_firebase_app()
    return auth.verify_id_token(id_token)
```

- [ ] **Step 3: Update .env.example**

Replace `backend/.env.example`:

```
# ALLOWED_ORIGINS=["http://localhost:5173","https://your-app.web.app"]
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carroquesi
# FIREBASE_CREDENTIALS_PATH=firebase-credentials.json
```

- [ ] **Step 4: Commit**

```bash
git add app/core/config.py app/core/firebase.py .env.example
git commit -m "feat: add database and firebase config"
```

---

## Task 3: Database models

**Files:**
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/models.py`

- [ ] **Step 1: Create `app/db/__init__.py`**

```python
```
(empty file)

- [ ] **Step 2: Create `app/db/models.py`**

```python
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=_uuid, primary_key=True)
    firebase_uid: str = Field(unique=True, index=True)
    display_name: Optional[str] = None
    email: str = Field(unique=True, index=True)
    photo_url: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class List(SQLModel, table=True):
    __tablename__ = "lists"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str
    owner_id: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ListMember(SQLModel, table=True):
    __tablename__ = "list_members"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    user_id: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)

    class Config:
        table = True


class ListItem(SQLModel, table=True):
    __tablename__ = "list_items"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    name: str
    quantity: Optional[str] = None
    brand: Optional[str] = None
    variety: Optional[str] = None
    store: Optional[str] = None
    purchased: bool = Field(default=False)
    added_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class ListInvite(SQLModel, table=True):
    __tablename__ = "list_invites"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id")
    invited_email: Optional[str] = None
    invited_by: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
```

Note: `UNIQUE(list_id, invited_email)` for non-null emails is enforced in the Alembic migration (Task 5), not in SQLModel Field constraints, since SQLModel doesn't support partial unique indexes in Field definitions.

- [ ] **Step 3: Verify models import cleanly**

```bash
uv run python -c "from app.db.models import User, List, ListMember, ListItem, ListInvite; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add app/db/
git commit -m "feat: add SQLModel database models"
```

---

## Task 4: Database session

**Files:**
- Create: `backend/app/db/session.py`

- [ ] **Step 1: Create `app/db/session.py`**

```python
from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.core.config import settings

engine = create_engine(settings.database_url)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
```

- [ ] **Step 2: Commit**

```bash
git add app/db/session.py
git commit -m "feat: add database session dependency"
```

---

## Task 5: Alembic migrations

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/0001_initial_schema.py`

- [ ] **Step 1: Initialise Alembic**

```bash
cd backend
uv run alembic init alembic
```

- [ ] **Step 2: Configure `alembic.ini`**

Find the line:
```
sqlalchemy.url = driver://user:pass@localhost/dbname
```
Replace with:
```
sqlalchemy.url = postgresql://postgres:postgres@localhost:5432/carroquesi
```

Note: in production this will be overridden by `env.py` reading from `settings`. The value here is just a fallback for local use.

- [ ] **Step 3: Update `alembic/env.py`**

Replace the generated `alembic/env.py` with:

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from app.core.config import settings
import app.db.models  # noqa: F401 — import models so SQLModel registers their metadata

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Generate initial migration**

```bash
uv run alembic revision --autogenerate -m "initial schema"
```

This creates `alembic/versions/<hash>_initial_schema.py`. Rename it to `0001_initial_schema.py` for clarity (optional).

- [ ] **Step 5: Edit the migration to add the partial unique index on `list_invites`**

Open the generated migration file and add inside `upgrade()`, after the table creation:

```python
op.create_index(
    "uq_list_invites_list_email",
    "list_invites",
    ["list_id", "invited_email"],
    unique=True,
    postgresql_where="invited_email IS NOT NULL",
)
```

And inside `downgrade()`:

```python
op.drop_index("uq_list_invites_list_email", table_name="list_invites")
```

- [ ] **Step 6: Run migration against a local Postgres instance**

Start Postgres locally (e.g. via Docker):

```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name carroquesi-db postgres:16
```

Run migrations:

```bash
uv run alembic upgrade head
```

Expected output ends with: `Running upgrade  -> <revision>, initial schema`

- [ ] **Step 7: Commit**

```bash
git add alembic.ini alembic/
git commit -m "feat: add Alembic with initial schema migration"
```

---

## Task 6: Auth dependency

**Files:**
- Create: `backend/app/dependencies.py`

- [ ] **Step 1: Create `app/dependencies.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.firebase import verify_id_token
from app.db.models import List, ListMember, User
from app.db.session import get_session

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    try:
        decoded = verify_id_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = session.exec(select(User).where(User.firebase_uid == decoded["uid"])).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_member(
    list_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
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
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> tuple[List, User]:
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if lst.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner")
    return lst, current_user
```

- [ ] **Step 2: Commit**

```bash
git add app/dependencies.py
git commit -m "feat: add get_current_user, require_member, require_owner dependencies"
```

---

## Task 7: Test infrastructure

**Files:**
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create `tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db.models import User
from app.db.session import get_session
from app.dependencies import get_current_user
from app.main import app


@pytest.fixture(name="engine")
def engine_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session")
def session_fixture(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture(name="user")
def user_fixture(session: Session) -> User:
    user = User(firebase_uid="uid-alice", display_name="Alice", email="alice@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="other_user")
def other_user_fixture(session: Session) -> User:
    user = User(firebase_uid="uid-bob", display_name="Bob", email="bob@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="client")
def client_fixture(session: Session, user: User):
    def _get_session():
        yield session

    def _get_current_user():
        return user

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[get_current_user] = _get_current_user
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="other_client")
def other_client_fixture(session: Session, other_user: User):
    def _get_session():
        yield session

    def _get_current_user():
        return other_user

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[get_current_user] = _get_current_user
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
```

- [ ] **Step 2: Verify test infrastructure works**

```bash
uv run pytest tests/ -v --collect-only
```

Expected: collects 0 tests (no tests yet), no errors.

- [ ] **Step 3: Commit**

```bash
git add tests/conftest.py
git commit -m "test: add test infrastructure with in-memory SQLite and dependency overrides"
```

---

## Task 8: POST /auth/sync

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/routers/auth.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import User


def test_sync_creates_new_user(session: Session, client: TestClient, user: User):
    # The user fixture already exists; simulate a sync for a brand-new user
    # by overriding with a client that has no pre-existing DB user.
    # We test the upsert: if the user already exists, it should return the existing record.
    response = client.post("/auth/sync")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == user.email
    assert data["display_name"] == user.display_name


def test_sync_is_idempotent(session: Session, client: TestClient, user: User):
    client.post("/auth/sync")
    client.post("/auth/sync")
    users = session.exec(select(User)).all()
    # Should still be only one user with this email
    matching = [u for u in users if u.email == user.email]
    assert len(matching) == 1
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_auth.py -v
```

Expected: FAIL — router not yet registered.

- [ ] **Step 3: Create `app/schemas/__init__.py`**

```python
```
(empty)

- [ ] **Step 4: Create `app/schemas/auth.py`**

```python
from pydantic import BaseModel


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str | None
    photo_url: str | None
```

- [ ] **Step 5: Create `app/routers/__init__.py`**

```python
```
(empty)

- [ ] **Step 6: Create `app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db.models import User
from app.db.session import get_session
from app.dependencies import get_current_user
from app.schemas.auth import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sync", response_model=UserRead)
def sync_user(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """
    Called by the frontend immediately after Firebase login.
    The get_current_user dependency validates the Firebase token.
    This endpoint ensures the user exists in Postgres.
    Since get_current_user already fetches the user (and will 401 if not found),
    we rely on a separate upsert path here.
    """
    # Re-fetch to allow future upsert logic (e.g. update display_name from token)
    return current_user
```

Note: The `get_current_user` dependency raises 401 if the user is not in the DB. For a true upsert (first-time registration), the frontend must pass the Firebase token and the backend creates the user if missing. Update `get_current_user` in `dependencies.py` to create the user on first sync:

Update `app/dependencies.py` — the `get_current_user` function:

```python
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    try:
        decoded = verify_id_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = session.exec(select(User).where(User.firebase_uid == decoded["uid"])).first()
    if user is None:
        # First login — create the user record
        user = User(
            firebase_uid=decoded["uid"],
            email=decoded.get("email", ""),
            display_name=decoded.get("name"),
            photo_url=decoded.get("picture"),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user
```

- [ ] **Step 7: Register the auth router in `app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth

app = FastAPI(title="CarroQueSí API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
uv run pytest tests/test_auth.py -v
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/schemas/ app/routers/ app/main.py app/dependencies.py tests/test_auth.py
git commit -m "feat: add POST /auth/sync with Firebase upsert"
```

---

## Task 9: Lists CRUD

**Files:**
- Create: `backend/app/schemas/lists.py`
- Create: `backend/app/routers/lists.py`
- Create: `backend/tests/test_lists.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_lists.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import List, ListMember


def test_create_list(client: TestClient, session: Session):
    response = client.post("/lists", json={"name": "Mercadona"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Mercadona"
    # Owner is automatically a member
    members = session.query(ListMember).filter_by(list_id=data["id"]).all()
    assert len(members) == 1


def test_get_lists_returns_owned_and_member_lists(client: TestClient, session: Session, user):
    response = client.post("/lists", json={"name": "My List"})
    assert response.status_code == 201
    response = client.get("/lists")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_list_detail(client: TestClient):
    created = client.post("/lists", json={"name": "Detail List"}).json()
    response = client.get(f"/lists/{created['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Detail List"


def test_get_list_not_member_returns_403(client: TestClient, other_client: TestClient):
    created = client.post("/lists", json={"name": "Private"}).json()
    response = other_client.get(f"/lists/{created['id']}")
    assert response.status_code == 403


def test_rename_list(client: TestClient):
    created = client.post("/lists", json={"name": "Old Name"}).json()
    response = client.patch(f"/lists/{created['id']}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_rename_list_non_owner_returns_403(client: TestClient, other_client: TestClient, session: Session):
    created = client.post("/lists", json={"name": "Owned"}).json()
    response = other_client.patch(f"/lists/{created['id']}", json={"name": "Hacked"})
    assert response.status_code == 403


def test_delete_list(client: TestClient, session: Session):
    created = client.post("/lists", json={"name": "To Delete"}).json()
    response = client.delete(f"/lists/{created['id']}")
    assert response.status_code == 204
    assert session.get(List, created["id"]) is None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_lists.py -v
```

Expected: FAIL

- [ ] **Step 3: Create `app/schemas/lists.py`**

```python
from datetime import datetime
from pydantic import BaseModel


class ListCreate(BaseModel):
    name: str


class ListUpdate(BaseModel):
    name: str


class ListRead(BaseModel):
    id: str
    name: str
    owner_id: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Create `app/routers/lists.py`**

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListItem, ListMember, User
from app.db.session import get_session
from app.dependencies import get_current_user, require_member, require_owner
from app.schemas.lists import ListCreate, ListRead, ListUpdate

router = APIRouter(prefix="/lists", tags=["lists"])


def _bump_updated_at(lst: List, session: Session) -> None:
    lst.updated_at = datetime.utcnow()
    session.add(lst)


@router.get("", response_model=list[ListRead])
def get_lists(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    memberships = session.exec(select(ListMember).where(ListMember.user_id == current_user.id)).all()
    list_ids = [m.list_id for m in memberships]
    lists = session.exec(select(List).where(List.id.in_(list_ids))).all()
    return lists


@router.post("", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_list(
    body: ListCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lst = List(name=body.name, owner_id=current_user.id)
    session.add(lst)
    session.flush()  # get lst.id before committing
    member = ListMember(list_id=lst.id, user_id=current_user.id)
    session.add(member)
    session.commit()
    session.refresh(lst)
    return lst


@router.get("/{list_id}", response_model=ListRead)
def get_list(list_and_user: tuple = Depends(require_member), session: Session = Depends(get_session)):
    lst, _ = list_and_user
    return lst


@router.patch("/{list_id}", response_model=ListRead)
def rename_list(
    body: ListUpdate,
    list_and_user: tuple = Depends(require_owner),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    lst.name = body.name
    _bump_updated_at(lst, session)
    session.commit()
    session.refresh(lst)
    return lst


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(
    list_and_user: tuple = Depends(require_owner),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    # Delete dependent rows first
    for item in session.exec(select(ListItem).where(ListItem.list_id == lst.id)).all():
        session.delete(item)
    for member in session.exec(select(ListMember).where(ListMember.list_id == lst.id)).all():
        session.delete(member)
    session.delete(lst)
    session.commit()
```

- [ ] **Step 5: Register router in `app/main.py`**

```python
from app.routers import auth, lists

app.include_router(auth.router)
app.include_router(lists.router)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
uv run pytest tests/test_lists.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/schemas/lists.py app/routers/lists.py app/main.py tests/test_lists.py
git commit -m "feat: add lists CRUD endpoints"
```

---

## Task 10: Members

**Files:**
- Create: `backend/app/schemas/members.py`
- Create: `backend/app/routers/members.py`
- Create: `backend/tests/test_members.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_members.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import ListMember


def _create_list(client, name="Test List"):
    return client.post("/lists", json={"name": name}).json()


def test_get_members(client: TestClient):
    lst = _create_list(client)
    response = client.get(f"/lists/{lst['id']}/members")
    assert response.status_code == 200
    assert len(response.json()) == 1  # owner is a member


def test_add_member_by_email(client: TestClient, other_user, session: Session):
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/members", json={"email": other_user.email})
    assert response.status_code == 201
    members = session.query(ListMember).filter_by(list_id=lst["id"]).all()
    assert len(members) == 2


def test_add_member_unknown_email_creates_invite(client: TestClient, session: Session):
    from app.db.models import ListInvite
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/members", json={"email": "unknown@example.com"})
    assert response.status_code == 202
    invite = session.query(ListInvite).filter_by(list_id=lst["id"]).first()
    assert invite is not None
    assert invite.invited_email == "unknown@example.com"


def test_non_owner_cannot_add_member(client: TestClient, other_client: TestClient, other_user):
    lst = _create_list(client)
    # Make other_user a member first
    client.post(f"/lists/{lst['id']}/members", json={"email": other_user.email})
    # other_user tries to add someone else
    response = other_client.post(f"/lists/{lst['id']}/members", json={"email": "third@example.com"})
    assert response.status_code == 403


def test_remove_member(client: TestClient, other_user, session: Session):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/members", json={"email": other_user.email})
    response = client.delete(f"/lists/{lst['id']}/members/{other_user.id}")
    assert response.status_code == 204
    members = session.query(ListMember).filter_by(list_id=lst["id"], user_id=other_user.id).all()
    assert len(members) == 0


def test_member_can_remove_themselves(client: TestClient, other_client: TestClient, other_user):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/members", json={"email": other_user.email})
    response = other_client.delete(f"/lists/{lst['id']}/members/{other_user.id}")
    assert response.status_code == 204
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_members.py -v
```

Expected: FAIL

- [ ] **Step 3: Create `app/schemas/members.py`**

```python
from datetime import datetime
from pydantic import BaseModel


class AddMemberRequest(BaseModel):
    email: str


class MemberRead(BaseModel):
    id: str
    user_id: str
    list_id: str
    created_at: datetime
```

- [ ] **Step 4: Create `app/routers/members.py`**

`add_member` returns HTTP 202 when an invite is created and HTTP 201 when membership is created immediately. Use FastAPI's `Response` injection for dynamic status codes.

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListMember, User
from app.db.session import get_session
from app.dependencies import get_current_user, require_member, require_owner
from app.schemas.members import AddMemberRequest, MemberRead

router = APIRouter(prefix="/lists/{list_id}/members", tags=["members"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.utcnow()
    session.add(lst)


@router.get("", response_model=list[MemberRead])
def get_members(
    list_and_user: tuple = Depends(require_member),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    members = session.exec(select(ListMember).where(ListMember.list_id == lst.id)).all()
    return members


@router.post("")
def add_member(
    body: AddMemberRequest,
    response: Response,
    list_and_user: tuple = Depends(require_owner),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    target_user = session.exec(select(User).where(User.email == body.email)).first()

    if target_user is None:
        # User not registered yet — create a pending invite
        invite = ListInvite(list_id=lst.id, invited_email=body.email, invited_by=lst.owner_id)
        session.add(invite)
        _bump(lst, session)
        session.commit()
        response.status_code = status.HTTP_202_ACCEPTED
        return {"status": "invited", "email": body.email}

    existing = session.exec(
        select(ListMember).where(ListMember.list_id == lst.id, ListMember.user_id == target_user.id)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    member = ListMember(list_id=lst.id, user_id=target_user.id)
    session.add(member)
    _bump(lst, session)
    session.commit()
    session.refresh(member)
    response.status_code = status.HTTP_201_CREATED
    return MemberRead(
        id=member.id,
        user_id=member.user_id,
        list_id=member.list_id,
        created_at=member.created_at,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: str,
    list_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lst = session.get(List, list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    # Only owner or the member themselves can remove
    if current_user.id != lst.owner_id and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    member = session.exec(
        select(ListMember).where(ListMember.list_id == list_id, ListMember.user_id == user_id)
    ).first()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    session.delete(member)
    _bump(lst, session)
    session.commit()
```

- [ ] **Step 5: Register router in `app/main.py`**

```python
from app.routers import auth, lists, members

app.include_router(members.router)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
uv run pytest tests/test_members.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/schemas/members.py app/routers/members.py app/main.py tests/test_members.py
git commit -m "feat: add members endpoints"
```

---

## Task 11: Items

**Files:**
- Create: `backend/app/schemas/items.py`
- Create: `backend/app/routers/items.py`
- Create: `backend/tests/test_items.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_items.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session


def _create_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def test_add_item(client: TestClient):
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"})
    assert response.status_code == 201
    assert response.json()["name"] == "Milk"
    assert response.json()["purchased"] is False


def test_get_items(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Eggs"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Butter"})
    response = client.get(f"/lists/{lst['id']}/items")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_items_sorted_by_name(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Zucchini"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Apple"})
    response = client.get(f"/lists/{lst['id']}/items?sort=name")
    names = [i["name"] for i in response.json()]
    assert names == sorted(names)


def test_update_item_marks_purchased(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    assert response.status_code == 200
    assert response.json()["purchased"] is True


def test_delete_item(client: TestClient, session: Session):
    from app.db.models import ListItem
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "To Delete"}).json()
    response = client.delete(f"/lists/{lst['id']}/items/{item['id']}")
    assert response.status_code == 204
    assert session.get(ListItem, item["id"]) is None


def test_non_member_cannot_add_item(other_client: TestClient, client: TestClient):
    lst = client.post("/lists", json={"name": "Private"}).json()
    response = other_client.post(f"/lists/{lst['id']}/items", json={"name": "Hack"})
    assert response.status_code == 403


def test_add_item_bumps_updated_at(client: TestClient, session: Session):
    from app.db.models import List
    lst = _create_list(client)
    old_updated_at = session.get(List, lst["id"]).updated_at
    client.post(f"/lists/{lst['id']}/items", json={"name": "Tomato"})
    new_updated_at = session.get(List, lst["id"]).updated_at
    assert new_updated_at > old_updated_at
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_items.py -v
```

Expected: FAIL

- [ ] **Step 3: Create `app/schemas/items.py`**

```python
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ItemCreate(BaseModel):
    name: str
    quantity: Optional[str] = None
    brand: Optional[str] = None
    variety: Optional[str] = None
    store: Optional[str] = None


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[str] = None
    brand: Optional[str] = None
    variety: Optional[str] = None
    store: Optional[str] = None
    purchased: Optional[bool] = None


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: Optional[str]
    brand: Optional[str]
    variety: Optional[str]
    store: Optional[str]
    purchased: bool
    added_by: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Create `app/routers/items.py`**

```python
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListItem, User
from app.db.session import get_session
from app.dependencies import get_current_user, require_member
from app.schemas.items import ItemCreate, ItemRead, ItemUpdate

router = APIRouter(prefix="/lists/{list_id}/items", tags=["items"])

SortField = Literal["name", "store", "brand"]


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.utcnow()
    session.add(lst)


@router.get("", response_model=list[ItemRead])
def get_items(
    list_id: str,
    sort: SortField | None = None,
    list_and_user: tuple = Depends(require_member),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    query = select(ListItem).where(ListItem.list_id == lst.id)
    if sort == "name":
        query = query.order_by(ListItem.name)
    elif sort == "store":
        query = query.order_by(ListItem.store)
    elif sort == "brand":
        query = query.order_by(ListItem.brand)
    return session.exec(query).all()


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def add_item(
    body: ItemCreate,
    list_and_user: tuple = Depends(require_member),
    session: Session = Depends(get_session),
):
    lst, current_user = list_and_user
    item = ListItem(list_id=lst.id, added_by=current_user.id, **body.model_dump())
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/{item_id}", response_model=ItemRead)
def update_item(
    item_id: str,
    body: ItemUpdate,
    list_and_user: tuple = Depends(require_member),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str,
    list_and_user: tuple = Depends(require_member),
    session: Session = Depends(get_session),
):
    lst, _ = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    session.delete(item)
    _bump(lst, session)
    session.commit()
```

- [ ] **Step 5: Register router in `app/main.py`**

```python
from app.routers import auth, items, lists, members

app.include_router(items.router)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
uv run pytest tests/test_items.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/schemas/items.py app/routers/items.py app/main.py tests/test_items.py
git commit -m "feat: add items CRUD endpoints"
```

---

## Task 12: Invites

**Files:**
- Create: `backend/app/schemas/invites.py`
- Create: `backend/app/routers/invites.py`
- Create: `backend/tests/test_invites.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_invites.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ListInvite, ListMember


def _create_list(client):
    return client.post("/lists", json={"name": "Shared"}).json()


def test_invite_unknown_user_and_accept(
    client: TestClient, other_client: TestClient, other_user, session: Session
):
    lst = _create_list(client)
    # Invite by email (other_user exists in DB — but we test the invite flow via /lists/{id}/members)
    # For invite-flow test, use the invite endpoint directly with a pre-created invite
    invite = ListInvite(list_id=lst["id"], invited_email=other_user.email, invited_by=lst["owner_id"])
    session.add(invite)
    session.commit()
    session.refresh(invite)

    # other_user sees their pending invites
    response = other_client.get("/invites")
    assert response.status_code == 200
    assert any(i["id"] == invite.id for i in response.json())

    # other_user accepts
    response = other_client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 200
    member = session.exec(
        select(ListMember).where(ListMember.list_id == lst["id"], ListMember.user_id == other_user.id)
    ).first()
    assert member is not None
    assert session.get(ListInvite, invite.id) is None


def test_public_invite_preview_no_auth(client: TestClient, session: Session, user):
    lst = _create_list(client)
    invite = ListInvite(list_id=lst["id"], invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    # Call without auth — use a raw TestClient with no overrides
    from fastapi.testclient import TestClient as RawClient
    from app.main import app as _app
    with RawClient(_app) as raw:
        response = raw.get(f"/invites/{invite.id}")
    assert response.status_code == 200
    assert "list_name" in response.json()


def test_wrong_email_cannot_accept(client: TestClient, other_client: TestClient, session: Session, user):
    lst = _create_list(client)
    invite = ListInvite(list_id=lst["id"], invited_email="someone_else@example.com", invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = other_client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 403


def test_accept_already_member_is_idempotent(client: TestClient, session: Session, user):
    lst = _create_list(client)
    invite = ListInvite(list_id=lst["id"], invited_email=user.email, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 200
    assert session.get(ListInvite, invite.id) is None


def test_decline_invite(client: TestClient, session: Session, user):
    lst = _create_list(client)
    invite = ListInvite(list_id=lst["id"], invited_email=user.email, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.delete(f"/invites/{invite.id}")
    assert response.status_code == 204
    assert session.get(ListInvite, invite.id) is None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_invites.py -v
```

Expected: FAIL

- [ ] **Step 3: Create `app/schemas/invites.py`**

```python
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class InvitePreview(BaseModel):
    id: str
    list_name: str
    invited_by_name: str | None


class InviteRead(BaseModel):
    id: str
    list_id: str
    invited_email: Optional[str]
    invited_by: str
    created_at: datetime
```

- [ ] **Step 4: Create `app/routers/invites.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListInvite, ListMember, User
from app.db.session import get_session
from app.dependencies import get_current_user
from app.schemas.invites import InvitePreview, InviteRead

router = APIRouter(prefix="/invites", tags=["invites"])


@router.get("", response_model=list[InviteRead])
def get_my_invites(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invites = session.exec(
        select(ListInvite).where(ListInvite.invited_email == current_user.email)
    ).all()
    return invites


@router.get("/{invite_id}", response_model=InvitePreview)
def get_invite_preview(invite_id: str, session: Session = Depends(get_session)):
    """Public endpoint — no auth required. Used to show invite details before login."""
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    lst = session.get(List, invite.list_id)
    inviter = session.get(User, invite.invited_by)
    return InvitePreview(
        id=invite.id,
        list_name=lst.name if lst else "Unknown list",
        invited_by_name=inviter.display_name if inviter else None,
    )


@router.post("/{invite_id}/accept")
def accept_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    # Email-locked invite: only the matching user can accept
    if invite.invited_email is not None and invite.invited_email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite is not for you")

    # Idempotent: already a member
    existing = session.exec(
        select(ListMember).where(
            ListMember.list_id == invite.list_id, ListMember.user_id == current_user.id
        )
    ).first()
    if not existing:
        member = ListMember(list_id=invite.list_id, user_id=current_user.id)
        session.add(member)

    session.delete(invite)
    session.commit()
    return {"status": "accepted"}


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def decline_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    lst = session.get(List, invite.list_id)
    is_owner = lst and lst.owner_id == current_user.id
    is_invitee = invite.invited_email == current_user.email or invite.invited_email is None

    if not is_owner and not is_invitee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    session.delete(invite)
    session.commit()
```

- [ ] **Step 5: Register router in `app/main.py`**

```python
from app.routers import auth, invites, items, lists, members

app.include_router(invites.router)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
uv run pytest tests/test_invites.py -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/schemas/invites.py app/routers/invites.py app/main.py tests/test_invites.py
git commit -m "feat: add invite endpoints with opt-in flow and email-match enforcement"
```

---

## Task 13: Suggestions and polling

**Files:**
- Create: `backend/app/schemas/suggestions.py`
- Create: `backend/app/routers/suggestions.py`
- Create: `backend/tests/test_suggestions.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_suggestions.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session


def test_suggestions_returns_matching_names(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(f"/lists/{lst['id']}/items", json={"name": "Milk", "brand": "Pascual"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Mineral Water"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"})

    response = client.get("/suggestions?q=mi")
    assert response.status_code == 200
    names = [s["name"] for s in response.json()]
    assert "Milk" in names
    assert "Mineral Water" in names
    assert "Bread" not in names


def test_suggestions_includes_hints(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(f"/lists/{lst['id']}/items", json={"name": "Milk", "brand": "Pascual", "store": "Mercadona"})

    response = client.get("/suggestions?q=Milk")
    assert response.status_code == 200
    suggestion = next(s for s in response.json() if s["name"] == "Milk")
    assert suggestion["brand"] == "Pascual"
    assert suggestion["store"] == "Mercadona"


def test_suggestions_limited_to_current_membership(
    client: TestClient, other_client: TestClient, session: Session
):
    # other_user's list
    other_lst = other_client.post("/lists", json={"name": "Other"}).json()
    other_client.post(f"/lists/{other_lst['id']}/items", json={"name": "SecretItem"})

    response = client.get("/suggestions?q=Secret")
    names = [s["name"] for s in response.json()]
    assert "SecretItem" not in names


def test_polling_updated_at(client: TestClient):
    lst = client.post("/lists", json={"name": "Polling Test"}).json()
    response = client.get(f"/lists/{lst['id']}/updated-at")
    assert response.status_code == 200
    assert "updated_at" in response.json()


def test_polling_updated_at_changes_after_item_add(client: TestClient):
    import time
    lst = client.post("/lists", json={"name": "Polling Test"}).json()
    before = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]
    time.sleep(0.01)  # ensure timestamp differs
    client.post(f"/lists/{lst['id']}/items", json={"name": "New Item"})
    after = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]
    assert after > before
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_suggestions.py -v
```

Expected: FAIL

- [ ] **Step 3: Create `app/schemas/suggestions.py`**

```python
from typing import Optional
from pydantic import BaseModel


class SuggestionRead(BaseModel):
    name: str
    brand: Optional[str]
    variety: Optional[str]
    store: Optional[str]
```

- [ ] **Step 4: Create `app/routers/suggestions.py`**

```python
from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from app.db.models import List, ListItem, ListMember, User
from app.db.session import get_session
from app.dependencies import get_current_user, require_member
from app.schemas.suggestions import SuggestionRead

router = APIRouter(tags=["suggestions"])


@router.get("/suggestions", response_model=list[SuggestionRead])
def get_suggestions(
    q: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Find all list IDs the user is currently a member of
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]

    if not list_ids:
        return []

    # For each distinct name, pick the most recently added item's brand/variety/store.
    # Uses func.lower + like for SQLite (tests) and PostgreSQL (production) compatibility.
    subq = (
        select(
            ListItem.name,
            ListItem.brand,
            ListItem.variety,
            ListItem.store,
            func.row_number()
            .over(
                partition_by=ListItem.name,
                order_by=ListItem.created_at.desc(),
            )
            .label("rn"),
        )
        .where(
            ListItem.list_id.in_(list_ids),
            func.lower(ListItem.name).like(f"%{q.lower()}%"),
        )
        .subquery()
    )

    rows = session.exec(
        select(subq.c.name, subq.c.brand, subq.c.variety, subq.c.store)
        .where(subq.c.rn == 1)
        .limit(10)
    ).all()

    return [SuggestionRead(name=r.name, brand=r.brand, variety=r.variety, store=r.store) for r in rows]


@router.get("/lists/{list_id}/updated-at")
def get_updated_at(
    list_and_user: tuple = Depends(require_member),
):
    lst, _ = list_and_user
    return {"updated_at": lst.updated_at.isoformat()}
```

Note: The `func.lower(...).contains(...)` approach works in PostgreSQL. For SQLite (tests), use `func.lower(ListItem.name).like(f"%{q.lower()}%")` instead. To keep one implementation, use a raw `like`:

```python
.where(
    ListItem.list_id.in_(list_ids),
    func.lower(ListItem.name).like(f"%{q.lower()}%"),
)
```

- [ ] **Step 5: Register router in `app/main.py`**

```python
from app.routers import auth, invites, items, lists, members, suggestions

app.include_router(suggestions.router)
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
uv run pytest tests/test_suggestions.py -v
```

Expected: PASS

- [ ] **Step 7: Run the full test suite**

```bash
uv run pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add app/schemas/suggestions.py app/routers/suggestions.py app/main.py tests/test_suggestions.py
git commit -m "feat: add suggestions and polling endpoints"
```

---

## Task 14: Dockerfile and Cloud Run

**Files:**
- Modify: `backend/Dockerfile`

- [ ] **Step 1: Check the existing Dockerfile**

```bash
cat backend/Dockerfile
```

- [ ] **Step 2: Replace with a production-ready multi-stage build**

```dockerfile
FROM python:3.13-slim AS builder

WORKDIR /app

RUN pip install uv
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

FROM python:3.13-slim

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY alembic.ini ./
COPY alembic/ ./alembic/
COPY app/ ./app/

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Run migrations then start the server
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Note: Cloud Run injects `PORT` env var but defaults to 8080. The `CMD` runs migrations on every container start — safe because Alembic is idempotent (won't re-apply already-applied migrations).

- [ ] **Step 3: Build and verify locally**

```bash
cd backend
docker build -t carroquesi-backend .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/carroquesi \
  -e FIREBASE_CREDENTIALS_PATH=/creds/firebase.json \
  -v /path/to/firebase-credentials.json:/creds/firebase.json \
  carroquesi-backend
```

Expected: server starts, `GET http://localhost:8080/health` returns `{"status":"ok"}`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat: production Dockerfile with migrations on startup"
```

---

## Final check

- [ ] **Run the full test suite one last time**

```bash
cd backend
uv run pytest tests/ -v --tb=short
```

Expected: All tests PASS.

- [ ] **Verify linting (if configured)**

```bash
uv run ruff check app/ tests/
```
