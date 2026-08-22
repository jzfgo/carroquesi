repo: jzfgo/carroquesi
branch: main
path: frontend/src

## Last sync

date: 2026-08-02T09:30:00Z

### Updated in this project

- Turn 40 (final review sweep) + the clean handoff pass «CarroQueSí - Handoff (aprobados).dc.html»: only canonical approved screens, grouped by area; archive links for everything else.
- Offline queue removed in production (`offlineQueue`/`useQueueDrain`/`useIsOffline` → `connectivity.ts` + `useOnline` + `OfflineBand`, read-only offline): 40a redraws the offline state (band inside the sheet, dashed circles, reconnected state); 19b/19c withdrawn, out-of-scope item 2 moot.
- Store names consolidated by `storeKey` (`ListStoreEntry` registry, rename in `ListActionSheet` «Tiendas» sub-state): 40b adds the «Tiendas» row and rename sheet to the consolidated options sheet of 21a; resolves the turn-21 `strictStore` flag.
- README corrected: «17d» (share sheet) never existed — sharing lives in 17c; noted `lastPriceStore` (1 h store suggestion) and that `ThemeManager` is still system-only (34a pending).
- Team decisions (2 Aug): 4% dark-edge device check dismissed (accepted risk); «la verde» naming closed as non-issue (lists are named); two-photo long-ticket stitching deferred — tip withdrawn from 18c, out-of-scope item 6.

## Screen map

| Screen / option | Built from |
|---|---|
| 40a Sin conexión, solo lectura | components/OfflineBand.tsx, lib/connectivity.ts, hooks/useOnline.ts, lib/reconcileItems.ts |
| 40b Tiendas consolidadas | lib/storeKey.ts, components/ListActionSheet.tsx («stores»), types.ts (ListStoreEntry), hooks/useItemFilter.ts |
| 1a Lista (hoy) | components/ListHeader.tsx+css, ProgressBar.tsx+css, FilterBar.tsx+css, ItemList.tsx+css, ItemCard.tsx+css, SmartInputBar.tsx+css |
| 1b Panel + Registrar compra (hoy) | components/DashboardScreen.tsx+css, ListCard.tsx+css, CreateListCard.tsx+css, Wordmark.tsx+css, LogPurchaseSheet.tsx+css |
| 2a–2c Item row + hojas | components/ItemCard.*, ItemList.*, DESIGN.md (El Ticket), colorsAndType.css |
| 2d Barra de entrada | components/SmartInputBar.tsx+css, lib/parseInput.ts |
| 2e Hoja de detalles | components/LogPurchaseSheet.*, TagEditSheet.*, ItemActionSheet.* |
| 2f–2g Pantalla completa / modo pasillo | components/ListScreen.tsx+css, ListHeader.*, ItemList.* |
| 2h Tarjetas de lista, vacío, oscuro | components/ListCard.*, CreateListCard.*, Mascot.tsx, colorsAndType.css (.theme-dark) |
| 3a–3c Spec | colorsAndType.css, index.css, DESIGN.md, PRODUCT.md |
| 4a–4e Estados, ficha, filtros, píldora | components/ItemCard.*, ItemList.*, FilterBar.*, ListHeader.*, SmartInputBar.* |
| 5a–5d Ficha unificada, cerrar compra, cabecera | components/LogPurchaseSheet.*, PriceHistorySheet.tsx, TagEditSheet.*, ItemActionSheet.*, ListHeader.* |
| 6a–6d Segundo nivel, multi-tienda | components/StoreEditSheet.tsx, TagEditSheet.*, LogPurchaseSheet.* |
| 7a–7c, 8a–8c Marca vs tienda | lib/ownBrands.ts (`lookupOwnBrandStore`), hooks/useOwnBrandInference.ts |
| 9a–9c Cantidad delante | components/ItemCard.tsx, DESIGN.md (Tabular Numerals Rule) |
| 16a–16b Panel de listas | components/DashboardScreen.*, ListCard.*, CreateListCard.*, Wordmark.* |
| 16c Estados vacíos | components/DashboardScreen.* (empty), ItemList.* (empty), Mascot.tsx, FilterBar.* |
| 17a Acceso anticipado | components/WaitlistScreen.tsx+css, contexts/AuthContext.tsx (`isWaitlisted`), lib/api.ts (`submitWaitlistSignup`) |
| 17b Invitación | components/InviteScreen.tsx+css (`ERROR_MESSAGES`), lib/api.ts (`getInvitePreview`, `acceptInvite`) |
| 17c Miembros | components/ListMembersSheet.tsx+css (`MAX_MEMBERS`), lib/api.ts (`createOpenInvite`, `removeMember`), lib/clipboard.ts |
| 18a–18c Tickets apilados y límites | components/ItemList.*, ReceiptReviewSheet (nuevo), lib/receiptAi.ts, lib/receiptDate.ts |
| 19a–19c Sin conexión, avisos, cambios sin enviar | lib/offlineQueue.ts, hooks/useQueueDrain.ts, hooks/useIsOffline.ts, components/Toast.tsx+css, lib/networkError.ts |
| 20a Escanear para añadir | components/BarcodeScanner.tsx+css, BarcodeScanSheet.tsx+css (retirada), lib/api.ts (`getBarcode`), lib/parseInput.ts (sigilo `|`) |
| 20b–20c Sugerencias | components/DueSuggestionsSheet.tsx+css, lib/suggestions.ts (`formatFrequency`, `formatRecency`), lib/dismissedSuggestions.ts |
| 21a Nueva lista y opciones de lista | components/CreateListCard.tsx+css, EmojiPickerSheet.tsx+css, ListActionSheet.tsx+css, lib/curatedEmojis.ts, lib/api.ts (`updateList`, `deleteList`) |
| 21b Búsqueda con resultados | components/FilterBar.tsx+css, hooks/useItemFilter.ts (`filterItems`), lib/parseInput.ts |
| 22a–22b Ficha ampliada | types.ts (`ListItem`, `PriceEntry`), components/PriceHistorySheet.tsx+css, lib/itemCost.ts, lib/priceNormalization.ts, lib/formatPrice.ts |
| 32a–32c Oscuro, dos caminos | colorsAndType.css (`.theme-dark`, `--paper-*`, `--ink-*`), components/ListScreen.tsx+css, ItemList.*, DESIGN.md |
| 33a–33c Oscuro canónico, canto, tableros | colorsAndType.css (`.theme-dark`), ListScreen.tsx+css, ItemList.*, ListSettingsSheet (tablero) |
| 34a Conmutador de aspecto | components/SettingsScreen (23a), DashboardScreen.tsx (avatar menu), colorsAndType.css (`.theme-light`/`.theme-dark`) |
| 34b Las siete propagaciones | components/Sheet/overlay CSS, Mascot.tsx, BarcodeScanner.tsx+css, ListActionSheet.tsx (tablero), PriceHistorySheet.tsx+css, ReceiptReviewSheet |
| 34c Spec v5 | colorsAndType.css, index.css, DESIGN.md, PRODUCT.md |
| 23a–23b Ajustes y avisos | components/ApiKeySheet.tsx+css, FeedbackSheet.tsx+css, NotificationPrimingCard.tsx+css, InstallBanner.tsx+css, DashboardScreen.tsx (avatar menu), ListScreen.tsx, lib/push.ts, lib/pushCopy.ts, contexts/AuthContext.tsx |


## Sync history

### 2026-07-27T14:20:00Z

- Turns 32-34: the dark-mode pass, closed. Figure/ground resolved in favour of keeping paper above board (32a) over inverting it (32b); relief is drawn with an edge instead of a shadow, since a dark shadow on a dark board does not render.
- Board tones re-derived for dark against `colorsAndType.css` (`.theme-dark`): same luminance band as the light six, roughly double the chroma, so per-list boards still identify the list at a glance.
- Rules 17-19 added (order is invariant under light; a tone that loses light gains colour; secondary surfaces rise rather than sink in dark). New tokens `--edge-lit`, `--edge-cast`, `--void`, `--paper-lift`, `--series`.
- Audited all 28 approved screens: 21 translate by token swap alone, 7 needed a decision (modal veil, mascot, semantic colours, scanner, board picker, dashed strokes, price history).
- New `SettingsScreen` row «Aspecto» — three drawn thumbnails (claro / oscuro / sistema), persisted per device, NOT per account; the board stays per list.
- `BarcodeScanner.tsx` confirmed unchanged across modes: the camera is the only non-paper surface in the app.
- Flagged for device testing: the low-elevation 4% lit edge is the first thing that will disappear on a poor LCD; the dark mode is deliberately brighter than average because the sheet must stay the lightest surface.

- Turn 23 (ajustes) drawn from `ApiKeySheet.tsx`, `FeedbackSheet.tsx`, `NotificationPrimingCard.tsx`, `InstallBanner.tsx`, `lib/push.ts`, `lib/pushCopy.ts`, `AuthContext` (signOut), and the avatar-menu structure in `DashboardScreen`.
- Corrected: the panel avatar already opens a 4-item menu (Siri / Instalar / Feedback / Cerrar sesión), so 23a converts that popover into a sheet and adds notifications; install currently appears twice (menu item + banner).
- Notifications are PER DEVICE (`isPushEnabled` = granted + local subscription flag), so the row reads «en este móvil» and has five states, including granted-but-off.
- Turn 22 (ficha ampliada del producto) drawn from `types.ts` (`ListItem`, `PriceEntry`), `PriceHistorySheet.tsx`, `lib/itemCost.ts`, `lib/priceNormalization.ts`.
- Price-history scope segmented (Esta lista / Mis listas / Todos) reduced to "everything you paid"; community price dropped everywhere.
- Buy-again: the receipt's green tick slot is reused as "volver a comprar" on purchases from previous days (user's idea); swept into 18a and 21b.
- Turn 21: crear lista from `CreateListCard.tsx` + `EmojiPickerSheet.tsx` + `curatedEmojis.ts` (two components merged into one sheet, all 35 emojis + ∅ kept); búsqueda con resultados from `FilterBar.tsx` + `useItemFilter.ts`.
- Proposed unifying `strictStore` in `filterItems`: chip filter and search filter currently treat store-less items differently for the same `@tienda`.
- `ListActionSheet` found (rename, default-list/Siri, members, scan receipt, delete-with-confirm): rename already exists, so turn 21a is a consolidation of its four sub-states plus the emoji grid, not a new screen.
- Turn 20 scan flow settled: no continuous scan, single toast CTA (Ajustar), new items land in «Sin tienda» at the end, no ink marker.
- Scanner redrawn from `BarcodeScanner.tsx` + `.css` (black full-bleed, 260×160 white reticle r12, 2000px spread-shadow spotlight, "Apunta al código de barras", top-right close). Continuous scanning is flagged as a behaviour change: the component currently stops the stream on the first decode.
- Turn 20 (escanear y sugerencias) drawn from `BarcodeScanSheet.tsx`, `DueSuggestionsSheet.tsx`, `suggestions.ts`, `dismissedSuggestions.ts`, `parseInput.ts`.
- Scan-to-add drops the confirmation form entirely: add + toast with Deshacer/Ajustar; community price removed as unreliable; API store hints dropped.
- Suggestions moved into the tail of the list sheet, ink-only (dashed circle, handwritten label) — no accent icons inside the paper.
- Turn 19 (sin conexión, errores y deshacer) drawn from `offlineQueue.ts`, `useQueueDrain.ts`, `useIsOffline.ts`, `Toast.tsx+css`.
- Found and designed around two gaps in the current code: `.toast__cta` exists in CSS with no consumer (no undo anywhere), and `useQueueDrain` deletes non-network-failed ops, so rejected changes are lost with only a 3-second count.
- New sheet proposed: "Cambios sin enviar" — per-op cause, per-line retry, explicit discard.
- Rebuilt turn 17 (alta, invitación, compartir) against the real code: `WaitlistScreen`, `InviteScreen`, `ListMembersSheet`, `AuthContext`.
- Corrected three wrong assumptions: the entry screen leads with the waitlist and Google second; an invited user is NOT let past the waitlist; there IS an owner role with remove-member.
- Surfaced the undocumented `MAX_MEMBERS = 5` cap in the members sheet ("3 de 5") and proposed softer copy for "Expulsar".
- Turn 16 (panel de listas + empty states) rebuilt on the flat-surface rule; paper metaphor now scoped to the open list only.


### 2026-07-27T10:50:00Z

- Turn 23 (ajustes) from `ApiKeySheet`, `FeedbackSheet`, `NotificationPrimingCard`, `InstallBanner`, `lib/push.ts`, `AuthContext`; turn 22 (ficha ampliada) from `types.ts`, `PriceHistorySheet`, `lib/itemCost.ts`.
- Turns 24-31: per-list board tones, the perforated tear-off replacing the floating cart pill, the unclosed proto-ticket, and spec v4.

### 2026-07-27T08:48:05Z

- Turn 19 (sin conexión, errores y deshacer) from `offlineQueue.ts`, `useQueueDrain.ts`, `useIsOffline.ts`, `Toast.tsx+css`.
- Found `.toast__cta` unused (no undo) and non-network failures silently dropped from the queue; proposed the "Cambios sin enviar" sheet.

### 2026-07-27T07:56:00Z

- Rebuilt turn 17 (alta, invitación, compartir) against `WaitlistScreen`, `InviteScreen`, `ListMembersSheet`, `AuthContext`.
- Corrected three wrong assumptions: waitlist-first order, invitations do not skip the queue, owner role exists.
- Surfaced the undocumented `MAX_MEMBERS = 5` cap.

### 2026-07-25T23:05:18Z

- Recreated the current list screen, dashboard and "Registrar compra" sheet from source (turn 1); design options in turns 2 and 4–9.
- Added an "en el carro" state between pending and purchased, plus a "Cerrar compra" sheet for closing a trip without a receipt.
- Merged the details and price-history sheets into one product sheet; store grouping and quantity-first rows replace per-row chips.
- Hand-off spec of token deltas over `colorsAndType.css` and per-file component contracts (turn 3).
