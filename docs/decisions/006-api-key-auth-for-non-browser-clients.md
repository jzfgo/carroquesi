# ADR-006: Static per-user API keys for non-browser clients

**Status:** Accepted  
**Date:** 2026-07-16

## Context

Siri Shortcuts (JAV-7) and, later, an MCP server (JAV-8) need to call the CarroQueSí API from contexts where the existing Firebase Google Sign-In flow doesn't fit: a Shortcut action or an MCP client can't run an OAuth/interactive sign-in, but they can send a static credential in a header. [ADR-002](002-firebase-auth-only-postgres-for-data.md) established Firebase as the sole auth mechanism for the browser frontend; this decision is about the *second*, non-interactive path layered alongside it — not a replacement.

| Approach | Notes |
|---|---|
| **Static per-user API key (`X-Api-Key` header)** | One long-lived token per user, checked by a new dependency alongside the existing Firebase check |
| **OAuth 2.0 Authorization Server** | Standards-based, enables one-click connection from MCP client marketplaces without manual key distribution |
| **Firebase custom tokens minted server-side** | Reuse Firebase's token verification path entirely; short-lived, requires a minting endpoint and client-side refresh logic |

## Decision

Add an `ApiKey` table (one static key per user) and extend `get_current_user` (`backend/app/dependencies.py`) to accept `X-Api-Key` as a fallback authentication path, tried after the existing dev-bypass and Firebase-bearer checks. Requests authenticated this way always resolve `is_admin=False`, regardless of the underlying user's Firebase custom claims.

The key is stored in two forms, not one:
- **`key_hash`** (SHA-256, indexed, unique) — irreversible, used to look up the owning user from an incoming header value in O(1)
- **`key_ciphertext`** (Fernet, symmetric, server-side secret) — reversible, used only so a `.shortcut` file can be re-downloaded on a second device without forcing key rotation

## Rationale

**OAuth is the right eventual answer, but premature now.** It's explicitly called out in both JAV-7 and JAV-8 as a future layer once there's a real need for marketplace one-click install. Building an Authorization Server before either integration has a single user is speculative infrastructure — a static key ships both tickets with a fraction of the surface area.

**Firebase custom tokens don't fit static, long-lived clients.** They're short-lived by design and expect a client SDK to handle refresh — reasonable for a browser session, awkward for a Shortcut action or an MCP client that just wants to send the same header on every request indefinitely.

**One-way hashing alone isn't enough here — and that's a real tradeoff, not an oversight.** A pure one-way hash (the stronger default for API credentials — see GitHub PATs, which are never re-displayed) would mean a lost or reinstalled Shortcut requires the user to hit "Regenerar clave," which invalidates and breaks any *other* device's Shortcut using the old key. Reversible encryption keeps redownload-on-a-second-device working, at the cost of the key being recoverable if both the database and the encryption secret leak. Rotation ("Regenerar clave") is still the only way to invalidate a specific key, kept as the escape hatch for a suspected leak.

**Reuses the existing REST surface instead of bespoke endpoints.** Because the fallback lives in `get_current_user` itself, every existing `CurrentUser`-scoped endpoint (`items.py`, `lists.py`, `suggestions.py`) becomes API-key-authenticatable with zero router changes. Both Siri Shortcut actions and JAV-8's MCP tools call the same endpoints the frontend already uses.

## Consequences

- **Accepted:** Weaker at-rest guarantee than pure hashing — a combined database + `api_key_encryption_secret` compromise exposes usable keys. Mitigated by keeping the secret out of the database (env-only) and by rotation being cheap and user-initiated.
- **Accepted:** One key per user, not scoped per-integration — a Siri key and a future MCP key are the same credential. Fine at current scale; revisit if per-integration scoping (e.g. read-only keys) becomes a real requirement.
- **Accepted:** API-key auth can never carry `is_admin=True`, even for admin users — a deliberate ceiling, not a gap to fix later.
- **Gained:** JAV-8 (MCP server) needs no new auth design — it reuses `get_user_from_api_key` and the same `ApiKey` table as-is.
- **Watch:** If MCP client marketplaces become a priority (one-click connect without manual key copying), revisit OAuth 2.0 layering as originally scoped in JAV-8.
