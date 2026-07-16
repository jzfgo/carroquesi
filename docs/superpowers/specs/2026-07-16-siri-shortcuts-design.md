# Siri Shortcuts Integration — Design Spec

**Date:** 2026-07-16
**Status:** Approved
**Linear:** [JAV-7](https://linear.app/jzfgo/issue/JAV-7/siri-shortcuts-integration)

---

## Overview

Allow iOS/macOS users to interact with CarroQueSí via Siri without a native app: adding items, reading a list, marking items purchased, and checking due suggestions, all voice- or tap-driven through a downloadable Shortcut.

This introduces a new, non-Firebase auth path — a static per-user API key — which is deliberately built as shared infrastructure: JAV-8 (MCP server) is a separate, later effort that will authenticate with the same `X-Api-Key` mechanism this spec builds. Nothing here is Siri-specific at the backend layer; only the `.shortcut` plist generation and the frontend Apple-only UI are. The auth strategy itself (why a static key, why dual hash+encryption storage, what it costs) is recorded separately in [ADR-006](../../decisions/006-api-key-auth-for-non-browser-clients.md).

**Correction to the ticket's wording:** the ticket describes a "signed .shortcut plist." Genuine Apple code-signing is only available through Apple's own Gallery/iCloud-link distribution — no third-party server can produce it. What we ship instead is a valid, *unsigned* `.shortcut` binary plist that the user imports via iOS's standard "Add Shortcut" screen. Because every action in this Shortcut is a plain URL request (no scripting-type actions), it should import without the "untrusted shortcut" warning that scripting actions trigger. The Linear ticket description will be updated to drop "signed."

---

## Scope

**In scope:**
- `ApiKey` model + migration, encrypted at rest, one per user
- `get_current_user` extended to accept `X-Api-Key` as a fallback auth path
- `GET /shortcuts/cqs.shortcut` — generates and returns the `.shortcut` file
- `POST /account/api-key/regenerate` — rotates the key
- `.shortcut` actions: `add_item` (Siri-prompted), `read_list`, and a menu fallback for `mark_purchased` + due suggestions
- Frontend: Apple platform detection, avatar-menu entries for "Añadir atajo a Siri" and "Regenerar clave"

**Out of scope:**
- OAuth 2.0 Authorization Server (future, layered on top per the ticket)
- MCP server (JAV-8 — separate follow-up, reuses `get_user_from_api_key` directly)
- Multi-key-per-user support (one static key per user, matching the ticket)
- Automated end-to-end testing of the Shortcut's actual Siri behavior (no Apple device in CI/dev environment — see Testing)

---

## Data model

New table, `backend/app/db/models.py`:

```python
class ApiKey(SQLModel, table=True):
    __tablename__ = "api_keys"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", unique=True)
    key_hash: str = Field(unique=True, index=True)
    key_ciphertext: str
    last_used_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)
```

Two representations of the same key, serving different needs:
- **`key_hash`** (SHA-256 hex digest) — indexed, unique, used to look up the owning user from an incoming `X-Api-Key` header in O(1). Irreversible by design.
- **`key_ciphertext`** (Fernet token) — reversible, used only when regenerating the `.shortcut` download so a pre-existing key can be re-embedded without forcing rotation.

`user_id` is unique: one active key per user at a time, matching "static per-user token" in the ticket. Regeneration updates the existing row in place (new hash + ciphertext, `last_used_at` reset to `None`) rather than inserting a new row.

New Alembic migration adds the table. New setting `settings.api_key_encryption_secret` in `backend/app/core/config.py` (`.env`-sourced, required in prod). `cryptography` (already an installed transitive dependency via `firebase-admin`) is added explicitly to `backend/pyproject.toml` since it's now used directly for `Fernet`.

Key format: `cqs_` + `secrets.token_urlsafe(32)`.

---

## Auth path

`backend/app/dependencies.py::get_current_user` gains a third branch, tried in this order:
1. Dev bypass (`X-Dev-User-Id`, existing, dev-only)
2. Firebase bearer token (existing)
3. `X-Api-Key` header (new) — hash the incoming value, look up `ApiKey.key_hash`, resolve the owning `User`, update `last_used_at`

No router changes needed elsewhere: `items.py`, `lists.py`, `suggestions.py` all depend on `CurrentUser`, so they become API-key-authenticatable automatically. This is the reuse JAV-8 needs — its MCP tools map directly onto these same REST endpoints.

**Security boundary:** requests authenticated via API key always resolve `is_admin=False`, regardless of the underlying user's Firebase custom claims. Admin capability is Firebase-JWT-only; a leaked API key cannot escalate to admin.

**Error handling:** header present but hash not found → `401 Invalid API key` (mirrors the existing `401 Invalid token` for malformed Firebase JWTs). No credentials at all → existing `401 Not authenticated`.

---

## Endpoints

New `backend/app/routers/shortcuts.py` and `backend/app/routers/api_keys.py` (or a combined `account.py` — naming decided at implementation time, not architecturally significant).

**`GET /shortcuts/cqs.shortcut`** (Firebase auth required — this is a browser-initiated download, not a Shortcut action itself)
- Get-or-create the requesting user's `ApiKey` (create with a fresh key if none exists yet)
- Decrypt `key_ciphertext` to plaintext
- Resolve the user's most-recently-`updated_at` list as the embedded default list ID. If the user is a member of zero lists, return `409 Conflict` ("create or join a list before setting up Siri") rather than generating a Shortcut with no valid target — matches the existing pattern of list-scoped operations requiring membership
- Build the binary plist (see below), return with `Content-Disposition: attachment; filename="CarroQueSi.shortcut"`

**`POST /account/api-key/regenerate`** (Firebase auth required)
- Replace `key_hash`/`key_ciphertext` on the existing row (or create if none), reset `last_used_at`
- Returns `{"regenerated_at": ...}` — plaintext never leaves the server over JSON, only ever embedded directly in the `.shortcut` file bytes

**`GET /users/me`** (existing endpoint, extended)
- Response gains `has_api_key: bool` and `api_key_last_used_at: datetime | None`, so the frontend can gate the "Regenerar clave" menu item and show a last-used hint without a dedicated status endpoint

---

## `.shortcut` plist contents

Built server-side with stdlib `plistlib` (`FMT_BINARY`), using real `is.workflow.actions.*` identifiers. No third-party plist/Shortcuts library exists on PyPI worth depending on — this is hand-constructed.

- **`add_item`:** `Ask for Input` (text, Siri-promptable, "¿Qué quieres añadir?") → `Get Contents of URL` (`POST {api_base}/lists/{default_list_id}/items`, headers `X-Api-Key` + `Content-Type: application/json`, JSON body `{"name": "<ask result>"}`) → `Show Result` (confirmation)
- **`read_list`:** `Get Contents of URL` (`GET {api_base}/lists/{default_list_id}/items`) → `Get Dictionary from Input` / `Repeat with Each` to format item names → `Show Result`
- **Menu fallback** (`Choose from Menu`, two items):
  - **"Marcar como comprado"** — `Get Contents of URL` (`GET .../items`) → `Choose from List` (item names) → look up the chosen item's `id` from the fetched dictionary → `Get Contents of URL` (`PATCH .../items/{id}`, body `{"purchased": true}`)
  - **"Ver sugerencias"** — `Get Contents of URL` (`GET {api_base}/lists/{default_list_id}/due-suggestions`) → `Show Result`

The API key and default list ID are embedded as literal values inside the relevant `Get Contents of URL` action dictionaries (header field + URL), not as separate "Ask" prompts — the whole point is zero manual configuration.

---

## Frontend

**`frontend/src/hooks/useApplePlatform.ts`** (new) — `/iPhone|iPad|Mac/.test(navigator.userAgent)`. Deliberately not reusing `usePWAInstall`'s `isIOS`: that one excludes standalone-mode and Macs, and is scoped to install-banner logic specifically.

**`DashboardScreen.tsx` avatar menu** — two new conditional items, following the existing `showInstallEntry` pattern:
- **"Añadir atajo a Siri"** — shown when `useApplePlatform()` is true. `onClick` calls a new `downloadShortcut(getToken)` in `lib/api.ts`: `fetch()` the endpoint with the Firebase bearer token, read the response as a `Blob`, create an object URL, trigger download via a hidden `<a>`, revoke the object URL after. This is a new pattern in `api.ts` (no existing blob-download helper) since `apiFetch` assumes JSON responses.
- **"Regenerar clave"** — shown when `has_api_key` (from `getMe()`). Calls the regenerate endpoint, toasts confirmation, then immediately re-triggers `downloadShortcut` so the user gets an updated file without a second click.

---

## Testing

**Backend (automated):**
- `ApiKey` model + migration round-trip
- `get_current_user` auth-precedence: dev-bypass wins over Firebase, Firebase wins over API key, API key resolves correctly, invalid/missing key produces the right 401s, API-key auth never yields `is_admin=True`
- Fernet encrypt/decrypt round-trip, hash lookup consistency
- `.shortcut` endpoint: parse the generated binary plist back and assert action identifiers, header/body wiring, and default-list-ID substitution — structural assertions, not a live Shortcuts run
- Regenerate endpoint: hash/ciphertext actually change, `last_used_at` resets, old key stops authenticating

**Frontend (automated):**
- `useApplePlatform` unit tests (UA string matrix: iPhone/iPad/Mac → true, Android/Windows/generic desktop → false)
- Avatar menu render/gating tests (`has_api_key` toggles "Regenerar clave", platform toggles "Añadir atajo a Siri")
- `downloadShortcut` — mock `fetch`, assert blob handling and object-URL cleanup

**Manual (blocking, not automated):** actually importing the `.shortcut` file and running `add_item`/`read_list`/the menu fallback on a real iPhone/Mac. No Apple device exists in this dev/CI environment, so this is a required manual QA step on your own device before JAV-7 is considered done — not something either of us can verify through the harness.

---

## Definition of done (JAV-7-specific, in addition to repo-wide checklist)

- [ ] Backend/frontend automated tests above pass, `just ci` green
- [ ] Linear ticket JAV-7 description edited to remove "signed"
- [ ] `.shortcut` file imported and manually exercised (all four actions) on a real Apple device by the user
- [ ] CHANGELOG updated
