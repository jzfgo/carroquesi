# ADR-006: Static per-user API keys for non-browser clients

**Status:** Accepted, storage design amended 2026-07-17  
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

The key is stored as a single irreversible form:
- **`key_hash`** (SHA-256, indexed, unique) — used to look up the owning user from an incoming header value in O(1)

*(Amended 2026-07-17 — see below. The original design also stored a reversible `key_ciphertext`; that column never shipped and was dropped before merge once the reason for it stopped applying.)*

## Rationale

**OAuth is the right eventual answer, but premature now.** It's explicitly called out in both JAV-7 and JAV-8 as a future layer once there's a real need for marketplace one-click install. Building an Authorization Server before either integration has a single user is speculative infrastructure — a static key ships both tickets with a fraction of the surface area.

**Firebase custom tokens don't fit static, long-lived clients.** They're short-lived by design and expect a client SDK to handle refresh — reasonable for a browser session, awkward for a Shortcut action or an MCP client that just wants to send the same header on every request indefinitely.

**One-way hashing turned out to be enough — the case for reversibility didn't survive the shortcut redesign.** The original rationale for `key_ciphertext` was letting a `.shortcut` redownload silently re-embed the existing key without forcing rotation. That premise depended on the backend generating a unique `.shortcut` file per user at request time. The redesign to a single static, **signed** shortcut removes the per-user file entirely — so there is nothing to re-embed a key into. (The redesign was driven by signing being the verified-working import path; the earlier framing here cited an "iOS 15+ hard block on unsigned imports" as settled fact, but that rested on an unrecorded device test and isn't corroborated by public/Apple docs — see the softened caveat in the design spec's 2026-07-17 addendum. The dependency chain here holds regardless: a single signed file, per-user or not, has no embedding step.) The key now lives only as something the user pastes once into the Shortcut's `Text` action. With that use case gone, pure one-way hashing (the stronger default for API credentials — see GitHub PATs, never re-displayed) has no remaining downside here: "lost key → rotate and re-paste" is standard, acceptable UX, and it removes an entire at-rest exposure surface (`key_ciphertext` + `Fernet` + `api_key_encryption_secret`) that no longer bought anything. A freshly generated or rotated key is returned as plaintext exactly once, directly in the issuance/regenerate response body (never persisted in reversible form), for the user to copy into the Shortcut.

**Reuses the existing REST surface instead of bespoke endpoints.** Because the fallback lives in `get_current_user` itself, every existing `CurrentUser`-scoped endpoint (`items.py`, `lists.py`, `suggestions.py`) becomes API-key-authenticatable with zero router changes. Both Siri Shortcut actions and JAV-8's MCP tools call the same endpoints the frontend already uses.

## Consequences

- **Accepted:** A lost or reinstalled Shortcut requires the user to hit "Regenerar clave" and re-paste the new key manually — there is no silent re-embed path anymore. Acceptable: this is a one-Text-action edit, not a re-onboarding.
- **Accepted:** One key per user, not scoped per-integration — a Siri key and a future MCP key are the same credential. Fine at current scale; revisit if per-integration scoping (e.g. read-only keys) becomes a real requirement.
- **Accepted:** API-key auth can never carry `is_admin=True`, even for admin users — a deliberate ceiling, not a gap to fix later.
- **Gained:** JAV-8 (MCP server) needs no new auth design — it reuses `get_user_from_api_key` and the same `ApiKey` table as-is.
- **Watch:** If MCP client marketplaces become a priority (one-click connect without manual key copying), revisit OAuth 2.0 layering as originally scoped in JAV-8.
