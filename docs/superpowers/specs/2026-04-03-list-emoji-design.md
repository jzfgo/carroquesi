# List Emoji Feature — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

Users can assign an emoji to each grocery list for visual distinction and customization. Inspired by Notion's page emoji. A random emoji is assigned at creation; owners can change it from the dashboard by tapping directly on the emoji (Notion-style). The emoji is per-list (shared by all members) and visible to everyone, but only the list owner may change it.

---

## 1. Data & API

### Backend

- Add nullable `emoji VARCHAR` column to the `lists` table via an Alembic migration. Default is `NULL`.
- `ListCreate` schema gains `emoji: str | None = None`.
- `ListUpdate` schema gains `emoji: str | None = None`.
- `ListRead` schema gains `emoji: str | None`.
- The existing `PATCH /lists/{id}` endpoint (owner-only, `OwnerDep`) accepts the new `emoji` field alongside the existing `name` field. No new endpoint needed.

### Frontend

- `ApiList` type gains `emoji: string | null`.
- `api.ts`: rename `renameList` → `updateList(getToken, listId, patch: { name?: string; emoji?: string | null })`. All call sites in `DashboardScreen` (`handleRename`, emoji update) use this single function.
- `api.ts`: extend `createList(getToken, name)` → `createList(getToken, payload: { name: string; emoji: string })` to pass the random emoji at creation time.
- Random emoji is chosen client-side from the curated set before calling `POST /lists`, so the column is always populated on creation.

---

## 2. Dashboard UI

### ListCard

- Renders the emoji between the drag handle (`⠿`) and the existing tap target.
- **Owner**: emoji is a `<button className="list-card__emoji">` that fires `onEmojiTap` prop.
- **Non-owner**: emoji is a non-interactive `<span className="list-card__emoji">`.
- When `emoji` is `null`, the slot renders nothing (no placeholder space).

### DashboardScreen

- Tracks `emojiList: ApiList | null` state (parallel to `activeList`).
- `SortableListCard` receives a new `onEmojiTap` prop, forwarded to `ListCard`.
- When `emojiList` is set, renders `<EmojiPickerSheet>`.
- On selection: optimistic update (snapshot → apply locally → PATCH → restore on failure + toast).
- `CreateListCard`'s `onCreate` picks a random emoji from the curated set and passes `{ name, emoji }` to `createList`.

---

## 3. List Screen Header

- `ListScreen` receives a new `listEmoji: string | null` prop from `DashboardScreen` (`selectedList.emoji`).
- `ListHeader` receives `emoji: string | null` and renders it as a plain `<span>` immediately before the `<h1>` title text — display only, no interaction.
- No polling or reactivity needed: the emoji can only change from the dashboard, so the value passed on entry is always current for the session.

---

## 4. EmojiPickerSheet Component

- New `frontend/src/components/EmojiPickerSheet.tsx` following the existing bottom sheet pattern:
  - Overlay + slide-up panel, drag handle, `Escape` to close.
  - Props: `onSelect: (emoji: string | null) => void`, `onClose: () => void`, `current: string | null`.
- **First option**: a "Ninguno" (none) button that calls `onSelect(null)`. Visually distinct (e.g. a ∅ or dashed circle).
- Grid of ~40 curated emojis, loosely grouped by category: food & drink, shopping & home, nature & misc.
- Tapping any emoji calls `onSelect(emoji)` immediately — no confirmation step.
- The curated set lives as a plain `const` array in the component file. No third-party emoji library.

### Curated Emoji Set (initial)

```
Food & drink: 🍎 🥦 🥕 🧅 🧄 🍋 🍇 🥩 🍗 🥛 🧀 🥚 🍞 🧁 🍫 🍷 🧃
Shopping & home: 🛒 🏠 🧹 🧺 🧴 🪥 🧻 💊 🐾 👶
Nature & misc: 🌿 🌸 ⭐ 🎉 ❤️ 🔥 💧 🌙
```

---

## 5. Error Handling & Testing

### Error handling

- Emoji update uses the optimistic pattern already used for rename: snapshot state → apply locally → call API → on failure, restore snapshot and show toast ("No se pudo cambiar el emoji").

### Tests

- `ListCard`: emoji button renders for owner; plain span renders for non-owner; nothing renders when `emoji` is null.
- `EmojiPickerSheet`: renders the grid; calls `onSelect` with the correct emoji on tap; "Ninguno" calls `onSelect(null)`.
- `DashboardScreen`: optimistic update applies immediately; on API failure, state is restored and toast shown.
- Backend: `PATCH /lists/{id}` with `{ "emoji": "🛒" }` updates the field; non-owner gets 403.

---

---

## 6. Invite Preview & Share Screen

### Backend

- `InvitePreview` schema gains `list_emoji: str | None`.
- `get_invite_preview` in `invites.py` includes `list_emoji=lst.emoji if lst else None` in the response.
- `share.py` OG title and description prepend the emoji when present: `f"{lst.emoji} {list_name} — CarroQueSí"` (fallback: `list_name — CarroQueSí`).

### Frontend

- `getInvitePreview` return type gains `list_emoji: string | null`.
- `InviteScreen`'s `Preview` interface gains `list_emoji: string | null`.
- The hardcoded `🛒` icon at `invite-screen__icon` is replaced by `preview.list_emoji ?? '🛒'`.

---

## 7. Existing Lists — Data Migration

Existing lists in the DB will have `emoji = NULL` after the schema migration. Rather than lazy-assigning on first load, a data migration assigns a random emoji to every existing list in the same Alembic revision that adds the column. This ensures all members see a consistent emoji immediately after deploy, with no client-side patching needed.

The migration uses Python's `random.choice` over the same curated set (defined inline in the migration file). The column is still nullable in the schema to preserve `onSelect(null)` ("Ninguno") support going forward.

---

## Out of Scope

- Per-user emoji preferences (each member picks their own) — this spec is per-list only.
- Emoji search or full emoji keyboard.
