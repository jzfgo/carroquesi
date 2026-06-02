# Feature Flags — Design Spec

**Date:** 2026-06-02
**Status:** Approved

---

## Overview

Per-user feature toggles that gate functionality (e.g. `ai_receipt_scanning`) during dogfooding and future paid tiers. No external dependency — flag state backed by Postgres, admin identity via Firebase custom claims.

---

## Data Model

New table `user_features`:

```python
class UserFeature(SQLModel, table=True):
    __tablename__ = "user_features"
    __table_args__ = (UniqueConstraint("user_id", "feature"),)

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    feature: str          # must match a key in REGISTRY
    enabled: bool = True
    granted_by: str       # "admin" (only value for now)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
```

`is_admin` is **not** a DB column on `User`. It is read from the Firebase JWT custom claim `decoded.get("is_admin", False)` in `get_current_user` and attached as a transient Python attribute (`user.is_admin`) on the returned `User` object.

---

## Flag Registry

`backend/app/services/feature_flags.py` is the single source of truth for all known flags and their defaults:

```python
@dataclass(frozen=True)
class FlagDef:
    name: str
    default: bool
    description: str = ""

REGISTRY: dict[str, FlagDef] = {
    f.name: f for f in [
        FlagDef("ai_receipt_scanning", default=False, description="Gemini receipt scanning"),
    ]
}
```

Adding a new flag = adding one entry here. Default state for new users is controlled by `default`.

### `is_enabled` service function

The single internal call site for flag checks:

```python
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
```

If no DB row exists, falls back to the registry default — new users automatically get the correct state without needing rows seeded per flag.

---

## Backend API

### Changes to `get_current_user`

After resolving the `User` from the DB, read `decoded.get("is_admin", False)` from the Firebase token claims and set `user.is_admin = ...` as a transient attribute.

### `require_admin` dependency

New dependency in `dependencies.py`. Reads `current_user.is_admin`; raises HTTP 403 if false.

### `POST /auth/sync` (extended)

Returns `UserRead` extended with `features: list[str]` — the names of all enabled flags for the user. Called by the frontend at every startup; feature state is available from the first response.

### `GET /users/me` (new endpoint)

Same response shape as `POST /auth/sync`. Used by `FeatureFlagsContext` to poll for flag changes mid-session (every 60s). Lives in `routers/auth.py`.

### `PATCH /admin/users/{user_id}/features` (new endpoint)

Protected by `require_admin`. Body: `{feature: str, enabled: bool}`. Upserts the `UserFeature` row for the given user and feature. Returns the updated feature list for that user.

### Receipt endpoint guard

`POST /lists/{list_id}/receipt` calls `feature_flags.is_enabled(current_user.id, "ai_receipt_scanning", session)` and raises HTTP 403 if false. This is the first flag enforced.

---

## Dev Auth Bypass Support

The dev auth bypass (`DEV_AUTH_BYPASS=true` + `X-Dev-User-Id` header) skips Firebase token decode entirely, so `decoded.get("is_admin", False)` is never called. Two additions make feature flags fully testable locally:

### `X-Dev-Is-Admin` header

In `get_current_user`, when `settings.dev_auth_bypass` is active, also read an optional `X-Dev-Is-Admin: true` header and set `user.is_admin` accordingly. Only honoured when `dev_auth_bypass=True` — ignored in production.

```python
# in get_current_user, dev bypass branch:
if settings.dev_auth_bypass and x_dev_user_id:
    user = ...  # resolve from DB as today
    user.is_admin = x_dev_is_admin  # new: from X-Dev-Is-Admin header
    return user
```

### Seed data

`scripts/seed.py` seeds `UserFeature` rows alongside other seed data:

- `seed-alice` → `ai_receipt_scanning` enabled (to test the happy path)
- `seed-bob` and `seed-carol` → no row (tests the gated/default-off state)

`_delete_seed_rows` is updated to also clean up `UserFeature` rows with `user_id` pointing to seed users.

---

## Admin Bootstrap

### `scripts/set_admin.py`

One-time script to grant admin status to a user via Firebase custom claims:

```python
import sys
import firebase_admin
from firebase_admin import auth, credentials

cred = credentials.Certificate("backend/firebase-credentials.json")
firebase_admin.initialize_app(cred)

uid = sys.argv[1]
auth.set_custom_user_claims(uid, {"is_admin": True})
print(f"Set is_admin=True for {uid}")
print("User must refresh their Firebase token (wait up to 1 hour, or force-refresh in the app).")
```

### Justfile recipe

Added to `backend/Justfile`:

```just
# Grant admin privileges to a user (usage: just backend set-admin <firebase_uid>)
set-admin uid:
    uv run python scripts/set_admin.py {{uid}}
```

**Token propagation:** Firebase ID tokens are cached up to 1 hour. After running `set-admin`, the user must refresh their token. The `AuthContext` can force-refresh by calling `getIdToken(user, true)` — document this in the script output.

---

## Frontend

### `AuthUser` shape

```typescript
export interface AuthUser {
  id: string
  displayName: string
  photoUrl: string | null
  email: string
  features: string[]   // enabled flag names from POST /auth/sync
}
```

### Flag constants

`frontend/src/lib/featureFlags.ts` — single source of truth for flag name strings on the frontend:

```typescript
export const FLAGS = {
  AI_RECEIPT_SCANNING: 'ai_receipt_scanning',
} as const
```

### `FeatureFlagsContext`

`frontend/src/contexts/FeatureFlagsContext.tsx`:

- Reads `useAuth()` to know when the user is logged in
- Seeds initial state from `user.features` (available from `POST /auth/sync` at login)
- Polls `GET /users/me` every 60s while the user is logged in to pick up mid-session changes
- Cancels polling on sign-out or unmount
- Exposes `isEnabled(flag: string): boolean`

### Provider nesting in `App.tsx` / `main.tsx`

```tsx
<AuthProvider>
  <FeatureFlagsProvider>
    <App />
  </FeatureFlagsProvider>
</AuthProvider>
```

### Receipt scan UI gating

The receipt scan button/trigger is hidden entirely (not greyed out) when `isEnabled(FLAGS.AI_RECEIPT_SCANNING)` is false. The feature does not exist for users who don't have it enabled.

---

## Migration

Alembic migration added as the last step before merge (per project conventions). No existing data needs backfilling — the registry `default` handles new users automatically, and existing users without rows behave as if all flags are at their default state.

---

## Testing

- **Backend unit tests:** `is_enabled` with no DB row (falls back to registry default), with `enabled=True`, with `enabled=False`. Admin endpoint: 403 for non-admin, upsert behavior.
- **Frontend unit tests:** `FeatureFlagsContext` with mocked `GET /users/me`; `isEnabled` returns correct boolean; polling re-fetches.
- Receipt endpoint returns 403 when flag is disabled, proceeds normally when enabled.

---

## Documentation Updates

The following files must be updated as part of this task (not optional cleanup):

- **`CLAUDE.md`** — update the Core Data Model section to include `user_features`; add `require_admin` to the auth dependencies list; add `X-Dev-Is-Admin` to the dev auth bypass section; add `just backend set-admin <firebase_uid>` to backend commands; add a note about the flag registry in `feature_flags.py`.
- **`TODO.md`** — remove the Feature flags entry once shipped.
- **`CHANGELOG.md`** — run `just changelog` before merging.
