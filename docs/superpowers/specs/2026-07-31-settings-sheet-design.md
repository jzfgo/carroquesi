# Phase 4a — the settings sheet

Design for the first half of spec v6 phase 4. Base branch is
`feat/redesign-spec-v6`, never `main`.

Phase 4 covers two things that share a number and nothing else: the settings
sheet, and the system's voice when the network or the server says no. This spec
is the first. The second — `19a` offline, `19b` toasts that carry their action,
`19c` the writes the server refused — is phase 4b and is named here only where
4a must not foreclose it.

## Design authority

The screens are already designed. The UI redesign handoff
(`design_handoff_carroquesi_ui`) is the reference, and this spec records
structure and behaviour rather than look. The option ids used below:

| id | what it is |
|---|---|
| `23a` | the settings sheet — one sheet, four blocks, opened from the avatar |
| `23b` | the notification row in its five states |
| `34a` | the appearance switcher — a three-way segment, 44 px |
| `19a`–`19c` | offline, errors and undo — **phase 4b**, not this one |

Where this spec and the handoff disagree, the handoff wins and the disagreement
is a bug in this spec. Three places where the handoff disagrees with *itself*
are settled below under *Flagged against the handoff*; the README asks for those
to be raised rather than quietly resolved.

## What this is for

There is no settings screen, but there are settings. They are scattered across
four places: the avatar menu on the dashboard holds appearance, install,
feedback and sign-out; `ApiKeySheet` holds the Siri shortcut; `InstallBanner`
repeats install as a dismissible banner on the same screen the menu is on; and
the only way to turn notifications on is a button that lives further down that
dashboard, next to a priming card that lives on a *list*.

Two rules are broken by that arrangement. Rule 1, *una acción, un camino*:
installing has two controls with two names on one screen. And rule 3, *un dato,
un sitio*: whether this device receives notifications is stated in one place and
changed in another.

This phase collects all of it into one sheet and deletes the duplicates.

## Scope

**In.**

- `SettingsSheet` — new. Opened from the dashboard avatar, replacing the menu.
- The notification row and its five states, including the one nobody can see
  from the system.
- The appearance segment moves into the sheet; `AppearanceSegment` loses the
  prop that only the menu needed.
- `ApiKeySheet` is absorbed into the Siri block and deleted.
- `InstallBanner` is deleted.
- The dashboard's own notifications button is deleted.
- The app version, which is not exposed to the frontend today.

**Out.**

- `19a`–`19c`. `Toast` is not touched here — 4b rewrites it, and touching it
  twice would mean reviewing it twice.
- `NotificationPrimingCard` keeps its logic exactly. `23b` is explicit that not
  asking until there is intent to share is the best product decision in the
  code. It gains the list's name and nothing else.
- The four empty states, list settings, the board picker (`16c`, `37a`) —
  phase 7.

## Settled decisions

### One sheet, and the menu stops existing

The avatar opens a sheet, not a floating menu of four items. The blocks, in the
order `23a` fixes — by how likely someone is to open them, not alphabetically or
by subsystem:

1. **Avisos** — the row with five states. First because it is the only one
   anyone touches twice.
2. **Aspecto** — the three-way segment. Second: everyone has a preference about
   light, but almost nobody revisits it.
3. **Atajo de Siri** — the default list, the key, and adding the shortcut.
4. **La app** — install, and feedback.
5. A footer that is not a block: *Salir de la cuenta* in `--tomate-0`, and the
   version in muted mono on the same line.

Only a household with the `push_notifications` flag sees the *Avisos* block at
all. The control it replaces is gated today, and a switch for a feature the
account does not have is worse than no switch.

A row that opens another sheet — Siri, feedback — **closes this one first**.
Both of those are `role="dialog" aria-modal="true"` with their own overlay, and
two live modals means two overlays and two elements each claiming to be the only
one. Closing is also what the menu did, so nothing about the flow changes.

The header above them is the account: avatar at 44 px, display name in the
serif at 20 px, email in mono at 12.5 px.

Rows are 52 px minimum, two lines where a row needs a subtitle, a 1 px `--rule`
between rows inside a block, and the block heading is 11 px uppercase in
`--ink-2` with .08em tracking. Side margin 20 px. The sheet is a flat surface:
no board, no handwriting, no paper language. That is the confinement rule — the
paper stays inside an open list.

### The five notification states

This is most of the work. Push preference *is* the token, and the token is per
device, so `isPushEnabled()` needs system `granted` **and** the local
subscription mark. The five, with the row's subtitle and its control:

| # | condition | subtitle | control |
|---|---|---|---|
| 1 | `default` | El sistema te lo preguntará una sola vez | toggle, off |
| 2 | `granted` + local mark | Cuando alguien añada o compre en tus listas | toggle, on |
| 3 | `granted`, no local mark | Se vuelven a encender sin volver a preguntar | toggle, off |
| 4 | `denied` | Bloqueados en los ajustes del sistema, no aquí | *Cómo* |
| 5 | cannot receive | (see below) | chevron / none |

**The order they are tested in is not the order they are numbered in.**
`canReceivePush` is asked first and state 5 wins outright; `permissionState()`
decides the rest. The two answers come from different functions and can disagree
— an iPhone in Safari without a home-screen install reports `default` and can
still never deliver a push — so testing permission first would hand that device
a switch that looks like it works. `NotificationPrimingCard` already resolves it
in this order.

States 2 and 3 are the reason there are five rather than four. They are
identical read from the system and opposite to the user, and the subtitle in
state 3 is doing real work: it says the switch can be turned back on without
another prompt, which is what removes the fear of touching it.

State 4 does not offer a toggle. Once permission is denied the browser will not
re-prompt, so a switch there would call `requestPermission()`, return at once and
change nothing — a control that looks broken. The app does not pretend it can
unblock itself; *Cómo* explains where the setting is.

State 5 has no toggle because there is nothing to turn on.

### Permission is requested from the gesture, first statement

`enablePush` already gets this right and the comment there says why: any `await`
before `Notification.requestPermission()` risks WebKit dropping the transient
activation, and on iOS a denial is permanent per origin.

The risk this phase adds is that the settings sheet is a new caller, and a
wrapper that awaits an auth token, a sheet transition or a confirmation before
delegating would break it without failing anything. So the row's handler calls
`enablePush` as its first statement, and a test pins it. A comment alone is not
enough — nothing checks a comment.

The priming card in `ListScreen` is the other caller and is already correct. It
is not changed here, but it is the second place this can regress.

### Appearance lives in settings, not in the list

Three words and not a switch, because *como el sistema* is what most people want
and a two-state toggle cannot say it — which is also why it is the factory
setting. No drawn thumbnails and no explanatory line: nobody needs a preview of
a dark mode, and drawing board-and-sheet here would be showing off the system
instead of letting someone choose.

It stays in settings rather than in the list, the opposite of the board, because
the board is the list's identity and the mode is a condition of your eye. The
whole household sees the same board, each in their own light.

`AppearanceSegment` already exists and already says all of this in its own
docstring. What changes is that its `itemRole` prop was there to serve
`role="menu"`, and the menu is gone. The prop and its `menuitemradio` branch go
with it: no parameter without a caller today.

### Install is one row, so the banner goes

Installing is currently two controls on one screen — a menu item called
*Instalar app* and a permanent dismissible banner. `23a` makes it one row,
*Instalar en la pantalla de inicio*.

What the row does depends on what the platform allows, and that difference is
already computed by `usePWAInstall`:

- installable through the browser → the row prompts, and has no subtitle
- iOS, not installed → the row is inert and its subtitle is the manual
  instruction, *Compartir → Añadir a pantalla de inicio*
- already installed → the row is absent

`InstallBanner` and its stylesheet are deleted, along with the
`pwa-install-dismissed` key it wrote. Nothing reads that key afterwards.

The cost is stated plainly: a banner is discovered without looking and a
settings row is not, so fewer people will install. That is the price of rule 1,
and the handoff paid it deliberately.

### The Siri block absorbs `ApiKeySheet`, it does not link to it

`23a` draws the three Siri rows **inside** the settings sheet, not behind a
chevron. So `ApiKeySheet` is deleted and its behaviour moves in whole:

- *Añade a «Casa»* with the subtitle *La lista predeterminada* — the default
  list's name, or a line saying to mark one when there is none
- *Tu clave*, masked in mono, with *Copiar* and *Regenerar* on the same row
- *Añadir el atajo a Shortcuts*

The key stays unrecoverable. A returning user sees the mask, because the server
holds only a hash; the plaintext exists on screen only in the moment it is
issued or regenerated.

*Regenerar* is **not** red. It is destructive and it is fixed in a minute, and
it already has a confirmation. That confirmation becomes an inline two-step in
the row itself — warning, *Sí, regenerar*, *Cancelar* — rather than a second
sheet. A modal over a modal is two overlays and two elements claiming to be the
only one, and the handoff draws no second sheet here.

The block is shown on Apple platforms only, as today. `23a` knows this — it
names the current menu item as *solo en Apple*.

### The house does not say "feedback"

*Contar algo al equipo*, not *Enviar feedback*. `FeedbackSheet` is unchanged
behind it: message, optional email, the Google address prefilled.

### The version is at the foot, not in a row

Muted mono beside sign-out. It is what someone is asked for when something goes
wrong, not something anyone browses to. The frontend does not know its own
version today, so `vite.config.ts` gains a `define` that reads `package.json`
and `environment.ts` re-exports it, like every other build-time constant.

## Flagged against the handoff

The README asks for conflicts inside the document to be raised. Three:

1. **Where the appearance row goes.** `23a` (turn 23) draws four blocks and no
   appearance row — dark mode had not been designed yet — and its screenshot
   matches. `34a` (turn 34) draws the switcher inside a settings sheet, above
   *Avisos*, and both spec closes (`34c`, `39a`) list an *Aspecto* row under
   `SettingsScreen.tsx`. So the row exists, and `23a`'s four blocks become five.
   Its **position** is a different question: `34a` is canonical for the switcher
   and `23a` for the sheet, and where a block sits is a property of the sheet —
   the same reasoning that settles the next two flags. So the order comes from
   `23a`'s own stated principle, by how likely someone is to open it, and
   *Aspecto* sits after *Avisos* rather than above it.
2. **The row label in `34a`.** That mockup says *Avisos de la casa*. `23b` is a
   correction of exactly that phrasing: the token is per device, so the same
   account can have them on for the phone and off for the laptop, and a label
   naming the household promises something the model does not keep. `23b`'s
   argument is specific and `34a`'s label is incidental chrome around the
   switcher, so *Avisos en este dispositivo* stands.
3. **The icon column.** `34a` draws a 20 px leading icon per row; `23a` and its
   screenshot have none. `23a` is canonical for the sheet, so no icons. The
   block headings carry the grouping that the icons would have carried.

Two smaller ones, decided rather than flagged, because the handoff simply does
not cover them:

- **State 5 off iOS.** `23b`'s copy for *unsupported* names the iPhone, which is
  the case `canReceivePush` was written for, and its chevron moves to the
  install row of the same sheet rather than repeating that row's explanation. A
  browser with no Notification API at all reaches the same state, has no install
  row to be sent to and cannot be told to install anything, so it gets its own
  sentence and no chevron.
- **What *Cómo* opens.** The handoff says it opens the instructions. A web page
  cannot open browser settings, so it discloses a short instruction in place.
  No new screen, no link that leads somewhere it cannot go.
- **The chevron on *Añade a «Casa»*.** There is nowhere for it to go. The
  default list is chosen from a list's own action sheet, and the screen that
  would own that choice is `37a`, in phase 7. A chevron leading nowhere is worse
  than none, so the row states the target and does not pretend to be a control.

## Frontend

New:

- `components/SettingsSheet.tsx` / `.css` — the sheet. Follows the established
  sheet shape: overlay, `role="dialog"`, `aria-modal`, a handle wired to
  `useSwipeToDismiss`, Escape to close.

Changed:

- `components/DashboardScreen.tsx` — the avatar opens the sheet. The menu, its
  state, the notifications button, the install banner and their imports go. The
  push state (`pushOn`, `permission`) moves into the sheet, which is now the
  only thing that reads or writes it. `permission` is held in state and not read
  inline for a reason someone had to find: a denial leaves `isPushEnabled()`
  false on both sides, so setting that alone is a same-value update React may
  skip, and the blocked row would never appear. That reasoning moves with the
  state.
- `components/AppearanceSegment.tsx` — the `itemRole` prop goes.
- `components/NotificationPrimingCard.tsx` — takes the list name and says it.
- `lib/environment.ts`, `vite.config.ts` — `APP_VERSION`.

Deleted:

- `components/InstallBanner.tsx` / `.css` / `.test.tsx`
- `components/ApiKeySheet.tsx` / `.css`
- the dashboard's `notifications-toggle` block and its styles

## Testing and verification

Unit, in `SettingsSheet.test.tsx` unless noted:

- each of the five notification states renders its own subtitle and its own
  control, driven by `permissionState()` and the local mark
- **the request is the first statement.** Click the row and assert
  `Notification.requestPermission` was called, with **no `await` between the two
  lines**. A handler that awaits anything before delegating has not called it
  yet when the assertion runs, so the test goes red. Written any other way it is
  vacuous, and the `await` is the whole point — say so in the test, or the next
  person adds one back and it passes again.
- state 4 renders no switch at all, not a disabled one
- state 3's switch turns push on without calling `requestPermission`
- the sheet closes on Escape, on the overlay and on a swipe
- appearance: three options, `radiogroup`, the current preference checked
- `AppearanceSegment.test.tsx` drops its `menuitemradio` case
- `DashboardScreen.test.tsx` — the avatar opens the sheet; no `role="menu"`
  survives; no install banner

E2E: the dashboard baseline changes, because the banner is gone. Regenerate
through `just frontend update-snapshots`, which runs the container every
committed baseline came out of. A new baseline for the open sheet is worth
having, but a screenshot is a weak guard for the thing this phase is actually
about — five states that differ by one line of text each — so those are asserted
in unit tests, not left to a pixel budget.

## What this leaves for 4b

- `Toast` still has no action slot and still carries `role="alert"`. `19b` puts
  an interactive control inside it, which an alert cannot hold. That is 4b's
  first problem and it is deliberately untouched here.
- The offline band and the per-row queued dot (`19a`) are not in this phase, so
  the dashboard's existing `offline-banner` stays exactly as it is.
- `useQueueDrain` still deletes an operation the server refused. `19c` is the
  sheet that stops it being lost, and it needs that deletion to stop first.
