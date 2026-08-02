# ADR-012: Date-based guards judge the viewer's calendar day

**Status:** Accepted
**Date:** 2026-08-01

## Context

Two API rules depend on what day it is: un-purchasing is refused for
purchases from a prior day (`PATCH /lists/{id}/items/{item_id}`, softened
by a write-grace window since JAV-46), and price deletion is refused for
prior-day purchases (`DELETE /lists/{id}/items/{item_id}/prices`). Both
compared the **UTC** day of `purchased_at` with the **UTC** day of the
server clock.

The app's date semantics everywhere else are the viewer's calendar:
receipt dates are built from local components and rendered back into the
viewer's calendar (`lib/receiptDate.ts` documents why a UTC reduction
"answers the wrong question"), and the E2E suite pins a timezone because
rendered days are viewer-relative. A Madrid user who bought something at
00:30 could not delete its price at 10:00 the same morning — in UTC the
purchase happened "yesterday". The frontend mirrors had meanwhile
drifted three ways: the un-purchase mirror compared local days, the
price-delete mirror compared UTC days, and the backend compared UTC days
(JAV-63).

## Decision

The day in a date-based guard is the **viewer's calendar day**.

- The frontend sends `X-Client-Timezone` (the browser's IANA zone from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`) on every `apiFetch`
  request.
- The backend resolves the header in `app/services/client_day.py` and
  evaluates both guards in that zone. A missing or unrecognized zone
  falls back to **UTC** — non-browser clients (Siri Shortcuts, ADR-006)
  keep working unchanged, with UTC-day semantics.
- Both frontend mirrors delegate to `lib/isSameCalendarDay.ts`, which
  compares local date components, so the mirrors and the server agree on
  which calendar they are talking about.

## Considered alternatives

- **UTC days on both sides.** Internally consistent and the smallest
  change, but permanently 1–2 hours off the Madrid user's real day, and
  contradicts the local-calendar semantics the rest of the app commits
  to.
- **Pin the product calendar to Europe/Madrid server-side.** Right for
  nearly all real users and needs no API change, but hardcodes a zone
  into account-agnostic API rules, and a traveling user's rendered dates
  (viewer-local) would still disagree with the guard's verdicts.

## Consequences

- The header is **trusted**. These guards protect against accidents, not
  adversaries — any member who wanted to bypass one could reach the data
  through other writes anyway. Nothing security-relevant may ever key off
  `X-Client-Timezone`.
- A traveling user's "today" moves with them. That is the intended
  meaning, not drift: the guard asks whether the purchase belongs to the
  day the user is currently living through.
- Any future date-based rule must resolve the viewer's zone through
  `app/services/client_day.py` rather than reducing timestamps to UTC
  days.
- **Update (JAV-125):** the two guards that motivated this record now ask
  a stored trip boundary instead of computing a day at request time — see
  [ADR-014](014-purchase-entity-and-trip-boundary.md). The decision here
  survives as the app's single timezone authority: `X-Client-Timezone`,
  trusted, UTC fallback, resolved by `app/services/client_day.py`. It is
  consumed when a trip's `tears_off_at` is stamped at creation, no longer
  each time a guard fires. `isSameCalendarDay` is gone with the guards;
  its frontend successor is `lib/isTripOpen.ts`.
