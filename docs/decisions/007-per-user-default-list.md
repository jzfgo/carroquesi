# ADR-007: Explicit per-user default list

**Status:** Accepted
**Date:** 2026-07-18

## Context

The Siri Shortcut (JAV-7) calls list-scoped endpoints with the literal path
segment `list_id="default"`, because a single static, signed shortcut can't know
a real list UUID ahead of time. JAV-7 shipped an interim resolver
(`require_member_or_default` in `backend/app/dependencies.py`) that resolved
`"default"` to the caller's **most-recently-`updated_at`** list.

That fallback is non-deterministic. `lists.updated_at` is bumped on every item
write and member change by **any** member of a shared list, so another member
touching a *different* shared list silently changes where the caller's Siri
"add milk" lands. JAV-7 accepted this as an imperfect stopgap; JAV-43 replaces
it with an explicit, user-controlled default.

## Decision

**A default is a per-user preference stored on the membership row**, not a
property of the list. Lists are shared: Alice and Bob can both be members of
list X and want different defaults. So the flag lives on `list_members`, not
`lists`.

- **Model:** `list_members.is_default: bool` (default false). At most one
  `is_default=true` per user, enforced in-app inside each mutating transaction
  (`backend/app/services/default_list.py` — `set_default` clears the user's other
  memberships). No DB-level partial unique index (a possible future hardening).
- **Resolver:** `"default"` resolves **only** to the caller's flagged
  membership. There is **no most-recently-updated fallback** — a non-deterministic
  fallback is precisely the behavior this feature removes. If the user has no
  default, the resolver returns 404.
- **Auto-assign on first list:** when a user first creates *or* first joins a
  list, if they have no default yet, that membership becomes the default. This is
  the *only* automatic assignment and it is unambiguous (their one and only list).
  It also covers a user who only ever joins lists.
- **No auto-promote on deletion/leave:** deleting or leaving your default list
  leaves you with no default (the resolver then 404s). Silently repointing
  "default" at a list the user didn't choose would be exactly the kind of silent
  destination change this feature exists to eliminate. Re-selecting is explicit.
- **Siri-setup gate:** because a shortcut with no default would only 404,
  `POST /account/api-key` (the setup entry point) is gated on the user having a
  default (409 `no_default_list`), and the frontend blocks the "Añadir atajo a
  Siri" action with a nudge to mark a list first.
- **"Mark as default" action:** `PUT /lists/{list_id}/default` sets the flag on
  the caller's membership and clears their others in one transaction. It does
  **not** bump `lists.updated_at` — the flag is per-user membership state,
  invisible to co-members, and must not trigger their polls. Surfaced in the list
  action sheet (both the dashboard dot-menu and the in-list menu).
- **Migration backfill:** the migration introducing `is_default` pins each
  existing user's default to their most-recently-updated list — a one-time
  snapshot of exactly where the old resolver would have sent "default" the day
  before, so nothing moves on day one. This `updated_at` ordering lives only in
  the backfill, never in the request path.

## Rationale

- **Per-membership, not per-list**, because lists are shared and the default is a
  personal choice. Storing it on `lists` would force all members to share one
  default.
- **Explicit-only resolver with no fallback** directly kills the non-determinism
  bug. Auto-assign-on-first-list plus the migration backfill mean an established
  user always has a default, so the 404 path is a genuine edge case, not a normal
  state.
- **No auto-promote** keeps a single, strong invariant: the Siri destination
  changes *only* when the user says so. A wrong automatic guess would silently
  mis-land grocery items — worse than a loud 404 the user can immediately fix.
- **Gating setup** moves the safeguard to the entry point: rather than papering
  over a missing default at resolve time, we stop the user from installing a
  shortcut that can't work yet.

## Alternatives considered

- **Keep the most-recently-updated fallback** (JAV-43's originally-agreed design)
  — rejected: reintroduces the non-determinism the feature removes.
- **Default as a property of `lists`** — rejected: can't express different
  defaults for co-members of a shared list.
- **Auto-promote the newest remaining list when the default is deleted** —
  considered and rejected: silently changes the Siri destination to a list the
  user didn't choose.

## Consequences

- Cleanup is automatic: deleting a list or leaving it removes the membership row
  and its flag; no dangling default state.
- `ListRead` carries a per-request `is_default` (computed from the caller's
  membership) so the frontend can badge the default and drive the action sheet.
- Deleting your default is a deliberate dead-end until you re-pick — surfaced to
  Siri users via the setup gate and the resolver's 404.
