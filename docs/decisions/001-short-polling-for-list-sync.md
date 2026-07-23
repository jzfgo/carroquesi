# ADR-001: Short-polling for real-time list sync

**Status:** Accepted  
**Date:** 2024

## Context

CarroQueSí is a collaborative grocery list app where multiple users share lists and mark items as purchased in real time. We needed a sync strategy so that when one user checks off an item, other users see the change promptly.

The main candidates were:

| Approach | Notes |
|---|---|
| **Short-polling** | Frontend polls a lightweight endpoint every N seconds |
| **WebSockets** | Persistent bidirectional connection per client |
| **Server-Sent Events (SSE)** | Server pushes updates over a persistent HTTP connection |
| **Firebase Realtime DB / Firestore** | Managed real-time sync, already in the stack for Auth |

## Decision

Use short-polling: the frontend calls `GET /lists/{list_id}/updated-at` every 5 seconds. If the timestamp has changed since the last fetch, it re-fetches the full item list.

## Rationale

**Simplicity over marginal latency.** Grocery shopping tolerates 5-second staleness. A co-shopper seeing an item checked off with a ~5s delay causes no real harm.

**WebSockets add operational complexity for no meaningful gain here.** They require connection management, reconnection logic, and stateful infrastructure. Cloud Run scales to zero and handles concurrent connections differently than a long-lived socket server — this would complicate deployment.

**SSE is simpler than WebSockets but still requires persistent connections**, which conflicts with Cloud Run's request-based scaling model.

**Firestore was already rejected** for all data storage (see the project architecture): keeping all CRUD in FastAPI + PostgreSQL avoids a split data model and keeps auth as the only Firebase dependency. Adding Firestore just for sync would reintroduce the complexity we chose to avoid.

**The polling endpoint is cheap.** `updated-at` returns a single timestamp; the full item re-fetch only fires on a cache miss. Under typical usage (one list open, 5s interval) this is ~720 requests/hour per active client — negligible.

## Consequences

- **Accepted:** Up to 5s lag before a co-shopper sees a change.
- **Accepted:** Slightly higher request volume vs. push-based approaches.
- **Gained:** No persistent connection management, no WebSocket infra, no Firestore dependency.
- **Watch:** If the app moves toward higher-frequency collaboration (e.g. live cursor positions, typing indicators), revisit WebSockets or SSE.
- **Related:** [ADR-010](010-web-push-via-fcm.md) adds web push for out-of-app notifications. It complements this decision rather than replacing it — polling keeps an *open* app fresh, push reaches a *closed* one. Push is best-effort and unavailable to iOS users without an installed PWA, so it can never be relied on as a sync mechanism.
