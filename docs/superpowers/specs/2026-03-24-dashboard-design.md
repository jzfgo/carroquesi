# Dashboard Design

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Minimal — list picker with progress, create new list

---

## Overview

Replace the current `ListLoader` (which always opens `lists[0]`) with a proper home screen (`DashboardScreen`) that shows all of the user's lists and lets them navigate into one. The dashboard is the screen users see after login.

---

## App Flow

```
Login
  └── DashboardScreen          ← new
        └── (tap a list card)
              └── ListScreen   ← already exists; gets onBack prop
                    └── (back button)
                          └── DashboardScreen
```

`App.tsx` currently routes `user → ListLoader`. After this change it routes `user → DashboardScreen`. `ListLoader` is removed.

---

## DashboardScreen

### Header

- App name "CarroQueSí" on the left
- User avatar (photo or initial) on the right
- Tapping the avatar signs the user out (calls `auth.signOut()`)

### List cards

A vertically scrollable list of `ListCard` components, one per list the user is a member of, sorted by `updated_at` descending (most recently active first).

Each card displays:
- **List name** (bold)
- **Progress bar** — same visual style as the one inside `ListScreen`
- **Subtitle** — "X de Y comprados" (e.g. "3 de 8 comprados")

Tapping a card navigates to `ListScreen` for that list.

### Create new list

A `CreateListCard` — a dashed-border card shown at the bottom of the list. Tapping it expands inline to reveal a text input and a confirm button. Submitting creates the list via `POST /lists` and appends the new card to the top of the list (re-fetch). If no lists exist yet, this is the only card shown with a prompt: "Crea tu primera lista".

### Loading state

Full-screen centered spinner (same `<span>` spinner already used in `App.tsx` and `ListLoader`).

### Error state

Centered message "No se pudo cargar tus listas" + "Reintentar" button (same pattern as current `ListLoader` error state).

---

## Components

| Component | Description |
|-----------|-------------|
| `DashboardScreen` | Top-level screen. Fetches lists, owns navigation state (which list is open, if any). Renders header, list of `ListCard`s, and `CreateListCard`. |
| `ListCard` | Displays list name, progress bar, and "X de Y comprados" subtitle. Calls `onClick` when tapped. |
| `CreateListCard` | New component. Dashed card that expands inline to a text input + confirm button when tapped (tap-to-expand, not always visible). Calls `onCreate(name)` on confirm. |

`ListScreen` receives a new `onBack: () => void` prop. When called, `DashboardScreen` clears the selected list and returns to the home view. No routing library is introduced — navigation state lives in a single `useState` in `DashboardScreen`.

---

## Backend Change — `GET /lists` Summary Fields

`GET /lists` currently returns:

```json
[{ "id": "...", "name": "...", "owner_id": "...", "created_at": "...", "updated_at": "..." }]
```

After this change it returns two additional fields per list:

```json
[{
  "id": "...",
  "name": "...",
  "owner_id": "...",
  "created_at": "...",
  "updated_at": "...",
  "item_count": 8,
  "purchased_count": 3
}]
```

### Implementation

In `backend/app/routers/lists.py`, the `get_lists` function is updated to compute counts via SQL aggregation — a single query with a `LEFT JOIN` and `GROUP BY`, not N+1 item fetches.

```python
# Pseudocode
SELECT list.*, COUNT(item.id) AS item_count,
       SUM(item.purchased) AS purchased_count
FROM lists list
JOIN list_members lm ON lm.list_id = list.id
LEFT JOIN list_items item ON item.list_id = list.id
WHERE lm.user_id = :user_id
GROUP BY list.id
```

`ListRead` schema (`backend/app/schemas/lists.py`) gets two new fields:
- `item_count: int = 0`
- `purchased_count: int = 0`

These default to `0` so existing tests that don't populate items continue to pass without changes.

---

## Frontend API Client

`frontend/src/lib/api.ts` — the `getLists` return type is updated to include `item_count` and `purchased_count`. The `ApiList` interface (currently inline in `ListLoader`) is moved to `frontend/src/types.ts` as a named export so `DashboardScreen` and tests can share it.

---

## Files Changed

### Backend
- `backend/app/routers/lists.py` — update `get_lists` with aggregation query
- `backend/app/schemas/lists.py` — add `item_count` and `purchased_count` to `ListRead`

### Frontend
- `frontend/src/App.tsx` — route `user → DashboardScreen` instead of `ListLoader`
- `frontend/src/types.ts` — add `ApiList` interface with summary fields
- `frontend/src/lib/api.ts` — `getLists` return type reflects new fields
- `frontend/src/components/DashboardScreen.tsx` — new
- `frontend/src/components/DashboardScreen.css` — new
- `frontend/src/components/ListCard.tsx` — new
- `frontend/src/components/ListCard.css` — new
- `frontend/src/components/CreateListCard.tsx` — new
- `frontend/src/components/ListScreen.tsx` — add `onBack` prop
- `frontend/src/components/ListLoader.tsx` — deleted
- `frontend/src/components/ListLoader.test.tsx` — deleted; replaced by `DashboardScreen.test.tsx`
- `frontend/src/components/DashboardScreen.test.tsx` — new (covers loading, error, empty, non-empty states)

---

## Out of Scope (this spec)

- Invite management (accepting pending invites)
- Member management (viewing/removing members, renaming/deleting lists)
- Sorting or filtering lists
- Real-time updates on the dashboard (polling)
- Routing library (React Router, etc.)
