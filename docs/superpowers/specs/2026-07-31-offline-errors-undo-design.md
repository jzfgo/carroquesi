# Phase 4b — offline, errors and undo

Design for the second half of spec v6 phase 4. Base branch is
`feat/redesign-spec-v6`, never `main`.

Phase 4a built the settings sheet and deliberately left this alone, so that
`Toast` is reviewed once rather than twice. Its spec is
`2026-07-31-settings-sheet-design.md`, and the three things it names as left
over are the three this one starts from.

## Design authority

The UI redesign handoff (`design_handoff_carroquesi_ui`) is the reference, and
this spec records structure and behaviour rather than look. The option ids:

| id | what it is |
|---|---|
| `19a` | offline — the band inside the sheet, and the per-row dot |
| `19b` | the three toasts, each carrying the control that closes it |
| `19c` | «Cambios sin enviar» — the sheet that does not exist yet |

Where this spec and the handoff disagree, the handoff wins and the
disagreement is a bug in this spec.

## What this is for

The app is optimistic and says so nowhere. `offlineQueue.ts` holds the writes,
`useQueueDrain` replays them, and `Toast.css` has carried a `.toast__cta` class
with no caller since the day it was written — the place for *undo* is built and
empty.

Worse, there is a silent loss. When an operation fails for a reason that is not
the network, `useQueueDrain` calls `remove(op.id)` and the write is gone; what
survives is a count in a toast that leaves after three seconds. The household is
told *how many* changes it lost and never *which*.

So the new rule, and the one this phase exists to keep: **nada se pierde en
silencio.**

## Scope

**In.**

- `19a` — the offline band moves inside the sheet, under the list's own header,
  and its text becomes a promise. Plus the per-row `--miel-0` dot for lines that
  are written here and not yet on the server.
- `19b` — `Toast` gains one optional action with a label, and a tone. Three
  tones, each with the control that closes it. `role="alert"` goes, because an
  alert cannot hold an interactive control.
- `19c` — `UnsentChangesSheet`. The queue stops deleting a rejected write, the
  HTTP status becomes a readable cause, retry is per line, discard is explicit.
- The way back into `19c` after the toast has gone (see *Flagged*, below).
- `DashboardScreen`'s own three-second toast timer is deleted. It duplicates
  `Toast`'s, and once the undo window is longer than three seconds it stops
  being redundant and becomes a bug that cuts the window short.

**Out.**

- **Undo on delete.** Reasoned below; it needs a backend change this phase does
  not make. Filed as JAV-96, which also records the cheaper half — a line that
  was never in a cart restores faithfully with no backend change at all.
- **Recovery against a deleted list.** Settled by the handoff's own out-of-scope
  list: that line is marked irrecoverable and can only be discarded. No
  «guardarlo en otra lista».
- Undo inside the receipt review. The handoff proposes it as a later turn's
  test, not as part of `19b`.
- Any backend change, and therefore any migration.

## Settled decisions

### `19a` — a list without signal is not broken

The supermarket is exactly where there is no coverage, so offline is the normal
state of this app and cannot be drawn as a failure. Nothing is blocked, nothing
is greyed, there is no modal and there is no *Reintentar* button — the queue
drains itself when the network returns, and offering a button would pretend a
tap is needed.

The band goes **inside the sheet, under the rubric**, where that list's own
notices already live, rather than above the list where it sits today. `ItemList`
gains a `notice` slot next to the `footer` slot it already has, and `ListScreen`
fills it.

Its text is a promise, not a diagnostic:

| pending | text |
|---|---|
| 0 | Sin conexión |
| 1 | Sin conexión · 1 cambio se enviará solo |
| n | Sin conexión · n cambios se enviarán solos |

A `cloud-off` glyph at 14 px leads it. No red, no count that alarms.

**The dot.** 6 px, `--miel-0`, after the item's name, on every row that is in
the queue. Without it the count in the band is a number that cannot be checked
against anything, which is the kind of tally rule 15c prohibits. It exists only
while there is something queued, and it disappears the moment the row is sent.

`useQueueDrain` already counts the queue for this list; it now also returns the
set of item ids in it, built as `op.tempId ?? payload.itemId` so that a row added
offline (painted under a `tmp-…` id) and a row edited offline both match. The dot
carries the accessible name «Sin enviar» — a purely visual mark would say
nothing to a screen reader, and the row is precisely where the count is checked.

The dot is a small visual affordance, so it is unit-tested against the queued
set rather than left to a pixel budget: a real one can cost less than the
tolerance and vanish silently.

### `19b` — one optional action, with a label

`Toast` today takes `{message, onDismiss}` and renders a close `X`. It gains:

```ts
export type ToastTone = 'verde' | 'tomate' | 'miel'
export interface ToastAction {
  label: string
  tone: ToastTone
  onAct: () => void
}
```

and `Toast` takes `{message, action?, onDismiss}`.

**The tone lives on the action, not beside it.** The colour lives only in the
3 px bar, and the bar is the window the action has left — so the colour and the
action are one object, not two coordinated props. It is also what keeps the
shape general: `20a` (scanning to add, phase 6, blocked on this) needs a toast
whose single action is labelled *Ajustar*, and it gets it by choosing a label
and a tone. Undo is just the action whose label is «Deshacer».

A toast with no action keeps the green bar it has today. The handoff says the
actionless notice survives as the exception and does not assign it a colour;
re-toning twenty existing call sites one by one is a judgement per site and not
this phase's question.

**What carries which:**

| tone | control | on |
|---|---|---|
| verde | *Deshacer* | anything that changes an item's state in one tap |
| tomate | *Reintentar* | something the user typed and lost |
| miel | *Ver cuáles* | the drain's report of what the server refused |

**The action closes the notice.** That is the handoff's own sentence — *cada
uno lleva la acción que lo cierra* — and it is also what keeps the toast from
sitting on top of whatever its action just opened. `Toast` dismisses itself
after calling the action, so no caller has to remember.

**No border on the body.** What separates the toast from what is behind it is
the shadow. A tinted edge spills the colour round the corners and a grey one
turns the notice into an alert card, which is what it is not. The
`border: 1px solid var(--verde-border)` on `.toast__body` goes.

**The window.** `AUTO_DISMISS_MS` stays 3000 for a toast with no action, and a
toast that carries one gets 6000 — three seconds is short for a decision. One
rule, no prop: the window is a property of whether there is anything to decide.
The bar's CSS animation is driven from the same constant through an inline
custom property, because two encodings of one duration drift apart and no
screenshot would catch it. A test asserts the computed `animation-duration`.

**The alert role goes.** `role="alert"` is an assertive live region and cannot
hold an interactive control that anyone can reliably reach. The message moves
into its own `role="status"` element — polite, and the live region is the text
and nothing else — and the action and the close button are siblings *outside*
it. A test pins that no `role="alert"` survives and that no button sits inside
the live region. The toast also stops auto-dismissing while
focus is inside it — a control that disappears under the finger reaching for it
is worse than no control.

**The ordering, which is the part that goes wrong quietly.** Five of the seven
defects found reviewing 4a were races between a tap and an async result, and
every one was invisible to a green suite. An undo is the same shape: a tap, a
timer and a round trip that can land on either side of it.

So: **the undo toast is shown when the write it undoes has settled**, not when
the tap happens. The inverse write cannot then overtake the original, because
the original is already answered. Offline this costs nothing — `enqueue` is
local, so the toast is still immediate, and two ops for one item drain in
`enqueuedAt` order to the right answer. A test pins it: no undo toast is
rendered before the write it undoes has settled.

Undo routes through the same `useListItems` mutation the tap used. Never a
second write path — a mutation that bypasses the hook is how the reconcile
guard gets reintroduced, and nothing goes red when it does.

**Why not on delete.** The handoff lists *borrar* under *Deshacer*, and the
condition it states is "changes an item's state and is done with one tap".
Deleting is neither, yet: it is a two-step confirm in `ItemActionSheet`, and
undoing it would mean re-creating the row. `ItemCreate` accepts name, quantity,
brand, stores, ean and price and **cannot set purchased state or a trip**. So
undoing the deletion of a line that was in the cart would put it back as
pending, detached from the shop it belonged to — an "undo" that silently
downgrades what it restores. Deferred with that reason, and the confirm stays. Doing
it properly is a backend change, which this phase does not make: it is JAV-96,
where the two sizes of the fix are set out — the pending-only undo that needs
nothing, and the restore that carries purchase state and trip, which changes
what *delete* means in the data model and wants an ADR.

### `19c` — «Cambios sin enviar»

The sheet does not exist, and it is the most important of the three. In a shared
app a rejection is ordinary — somebody deleted the product while you were
editing it without coverage — and those are exactly the cases where the user
typed something they do not want to lose.

**Stop deleting.** `useQueueDrain` currently does `remove(op.id)` on a
non-network failure. It now records the failure on the op instead and leaves it
in the store; the drain skips an op that carries one.

`QueuedOp` gains two optional fields. **`DB_VERSION` does not change** — adding
fields to a keyPath store needs no schema change, and bumping the version would
send `onupgradeneeded` back into `createObjectStore` on a store that exists.

- `label: string` — what the change was about, captured when it is enqueued,
  because the item may not exist by the time the sheet renders. Rows written
  before this change carry none, so the sheet renders a fallback rather than
  `undefined`.
- `failure?: { status: number; at: number }` — the answer the server gave.

**Each line says what it was, when it was, and why it did not go in**, in the
language of the house and not in codes. Three parts, all derived by pure
functions in `lib/queueCopy.ts` (the `lib/pushCopy.ts` precedent), unit-tested
there rather than through the sheet:

- *What* — the label, plus the kind: «Añadido», «Eliminado», «En el carro»,
  «Sacado del carro», «Renombrado», «Precio», «Cantidad», «Marca», «Tienda»,
  «Editado», «Compra». For an `updateItem` the kind comes from the patch's
  keys, which is the only place that distinguishes crossing something off from
  renaming it. The handoff writes «Tachado» there, from before the three states
  existed; the redesign deleted the strikethrough and this app's purchased flag
  now means *in the cart*, so the row says what the tap actually did.
- *When* — «hoy 8:10», «ayer 19:42», or «12 jul 19:42». `now` is a parameter so
  the test can build both ends from local date components: the vitest suite runs
  at the machine's zone, not Madrid, so a date test has to be zone-less itself.
- *Why* — from the HTTP status.

**Status to cause, and what may be retried.** The rule is one sentence: a status
that states a fact about the data will say the same thing to the same request,
and a status about who you are or how busy the server is will not.

| status | cause | retry |
|---|---|---|
| 400, 422 | el servidor no lo aceptó | no |
| 404 (add, close) | la lista ya no existe | no |
| 404 (update, delete) | el producto ya no existe | no |
| 409 (add) | ya estaba en la lista | no |
| 409 (update, delete) | la compra ya está archivada | no |
| 401 | hubo que volver a entrar | yes |
| 403 | sin permiso en esa lista | yes |
| 408, 429, 5xx, anything else | el servidor falló | yes |

An irrecoverable line is drawn without *Reintentar*. That is the handoff's own
open question, closed the way its author leaned: mark it, say so, and let it
only be discarded.

**Retry is a drain, not a bespoke send.** Retrying unmarks and runs the normal
drain pass over that list in `enqueuedAt` order. There is no second code path
that sends a queued op, because the ordering `drain` maintains is load-bearing:
it builds the map from `tmp-…` ids to real ones within a single pass, so an
`updateItem` for an item added offline is only correct if the `addItem` before
it ran in the same pass.

That is also why **a line that depends on an add which has not gone through is
not offered its own retry**: sending it alone would PATCH a `tmp-…` id, 404, and
come back irrecoverable while its add is still sitting there retryable. It is
discard-only until the add is dealt with. *Reintentar los N* unmarks everything
and drains once, which is the pass where the add gets its chance first and the
dependent resolves behind it.

**The buttons at the foot.** *Reintentar los N* counts the rows actually drawn
with a retry, and is absent when that is zero — an affordance for nothing is not
a control (rule 6). *Descartarlos* is explicit, at the foot, in `--tomate-0`,
and discards all of them: per-line discard is not drawn, and retrying what can
be retried and then discarding the remainder is the flow the sheet already
supports. The sheet closes itself when nothing is left in it.

**A rejected `closePurchase` is a row like any other.** Today it gets its own
carefully-built sentence — «No se pudo guardar una compra… Vuelve a cerrarla» —
because the shop was *gone* and being told to do it again was the only honest
thing left to say. It is not gone any more: it is in this sheet, under its store
name, with its own retry. Telling the household to re-enter a shop that is
saved would now be wrong, so that copy and its `lostShops` branch go, and the
drain reports one count for everything it could not send.

## Flagged against the handoff

The README asks for conflicts inside the document to be raised rather than
quietly resolved. One, and one gap.

1. **The mockup for `19c` draws *Reintentar* on «la lista ya no existe».** The
   same option's own note says the opposite — «lo que aún no sé resolver: si "la
   lista ya no existe", reintentar no puede funcionar nunca… me inclino por
   marcarla como irrecuperable», and the turn's test line asks for exactly that
   («marca las irrecuperables y quítales el reintento»). The note is the later
   thought and the mockup is the earlier drawing, so the note wins.

2. **`19c` has one way in and it lasts six seconds.** The only entry the handoff
   draws is *Ver cuáles* on the miel toast. Dismiss it, or miss it, and the
   rejected writes are unreachable for good — which is the failure the sheet
   was drawn to end. So while any rejected change exists for a list, its notice
   slot — the one `19a` establishes, in the sheet under the rubric — carries a
   row saying so, with *Ver cuáles*. It is the same slot, the same shape and no
   new chrome, and it shows **regardless of connectivity**, because a rejected
   write outlives the outage that caused it. It is also what E2E drives the
   sheet from: a test that has to catch a six-second toast is a flake.

## Frontend

New:

- `components/UnsentChangesSheet.tsx` / `.css` — the established sheet shape:
  overlay, `role="dialog"`, `aria-modal`, a handle wired to `useSwipeToDismiss`,
  Escape to close.
- `components/ListNotice.tsx` / `.css` — the band and the rejected-changes row.
- `lib/queueCopy.ts` — kind, cause, retryability and the time label.
- `hooks/useToast.ts` — the toast's state and its `showToast`. Three components
  own toast state today (`ListScreen`, `DashboardScreen`, `ListMembersSheet`),
  which is the third occurrence, and it is where the duplicated dismiss timer
  has been hiding.

Changed:

- `components/Toast.tsx` / `.css` — the action, the tone, the window, the live
  region, no body border.
- `components/ItemCard.tsx` / `.css` — the queued dot.
- `components/ItemList.tsx` — the `notice` slot.
- `components/ListScreen.tsx` — the band moves in, the undo toasts, the sheet.
- `components/DashboardScreen.tsx`, `components/ListMembersSheet.tsx` — onto
  `useToast`; the dashboard's own timer goes.
- `hooks/useQueueDrain.ts` — stop deleting, mark instead; the queued id set; one
  miel toast; retry entry points for the sheet.
- `lib/offlineQueue.ts` — `label`, `failure`, `markFailed`, and a `remove` for
  discard. No `DB_VERSION` change.
- `hooks/useListItems.ts` — labels on enqueue; undo toasts after the write
  settles; *Reintentar* on what the user typed and lost.
- `components/ListScreen.tsx` also stops swallowing a failed price. It caught
  and discarded the error as *non-critical*, which made losing a typed amount
  silent — the one thing this phase exists to end. It is `19b`'s own example of
  a *Reintentar*.

## Testing and verification

Unit:

- `queueCopy.test.ts` — every status in the table maps to its cause and its
  retryability; `updateItem` kinds come from the patch keys; the time label at
  today, yesterday and older, built from local date components.
- `Toast.test.tsx` — the action renders and fires; no `role="alert"` wraps it;
  the window is 3000 without an action and 6000 with one, **asserted as the
  computed `animation-duration` as well as the timer**, because the bar and the
  timer are two encodings of one number; no auto-dismiss while focus is inside.
- `ItemCard.test.tsx` — the dot renders keyed on `queued`, with its name.
- `useQueueDrain.test.ts` — a non-network failure leaves the op in the store and
  marks it; the drain skips a marked op; the miel toast counts every failure
  once and its control opens the sheet; retry unmarks and drains; discard
  empties the queue; the queued set names a row by its temp id and by the
  server's. The `lostShops` copy and its four grammar tests go.
- `offlineQueue.test.ts` — `markFailed` records and keeps; `clearFailure`
  undoes it; neither resurrects an op that has already been drained or
  discarded.
- `useListItems.test.ts` — the undo toast is not rendered before the write it
  undoes has settled. Written any other way it is vacuous, and the ordering is
  the whole point — say so in the test, or the next person moves the call back
  above the `await` and it still passes.
- `UnsentChangesSheet.test.tsx` — an irrecoverable line has no retry; a line
  depending on an unsent add has none either; *Reintentar los N* counts the rows
  drawn with one and is absent at zero; discard empties the queue and closes.
- `ListNotice.test.tsx` — the band's texts and their agreement in number; that
  it offers nothing to press; that the rejected row shows with a connection and
  opens the sheet.

Every guard above was deleted and watched fail before being kept.

E2E, in `smoke.spec.ts`, which is the one spec phase 6 did not touch — its
baselines are `add-item`, `dashboard`, `list-screen` and `settings`, and phase 6
regenerated `purchase-lifecycle` and `receipt-scanning`. Two new baselines,
no existing one regenerated, so there is nothing to conflict on at merge:

- offline, add an item, band and dot on screen → `offline-band`
- back online with two writes refused — one the server may yet accept, one it
  never will — dismiss the toast, open the sheet from the notice row →
  `unsent-changes`

Both under `expectScreenshot`, in light and dark. The second pins the clock,
because the sheet prints when each change was written; it also advances that
clock between the two adds, and waits for the band's count before advancing,
so the two rows carry distinct stamps and their order is a fact rather than a
tie broken by whatever the queue handed over first.

**Four existing baselines do change**, and they were the phase's one merge
hazard: `price-delete-guard-*` shows a toast, and the toast's body lost its
border. Phase 6 regenerated those same four on `feat/item-and-prices`, so
whichever branch merged second had to regenerate them again. That is settled:
phase 6 landed first (#198), this branch rebased onto it, and the four were
regenerated in the container against both changes together. Nothing else moves
— a tap now leaves an undo notice on screen, whose bar drains as it goes, so
the helpers that mark an item purchased close it before any screenshot is
taken.

The rebase also took phase 6's rename of `setPriceItemId` to `setActiveItemId`
in `handleSavePrice`, and moved this phase's price-retry test onto the new path
into the price sheet: phase 6 folded `PriceHistorySheet` into
`PriceHistoryBlock` inside the item sheet, so «Registrar un precio» is now one
hop from the row rather than two.

## Known limits

Seven things this phase leaves standing, each with an issue — so none of them
is a surprise to somebody reading «Cambios sin enviar» and taking it as
complete.

The first one changes how to read the rest: **everything built here protects
the queue, and there is a path that never reaches the queue.**

- **A write can name an id only this device has yet** (JAV-97). `addItem`
  paints its row under a temp id and enqueues only on a *network* error — so
  while the POST is merely slow, the row is on screen, undimmed and tappable.
  Crossing it off `PATCH`es a `tmp-…` id and 404s, with a *Reintentar* that
  can only 404 again. Deleting it 404s, restores the row, and then the add
  lands — putting back the thing the household deleted. Closing the trip files
  a total covering a line the endpoint skipped. None of the three is ever
  queued, so none of them reaches «Cambios sin enviar», and `targetsOf` never
  sees them. Not fixable with this phase's machinery: there is nothing to hold
  them *in*. It wants a promise keyed by the temp id that later mutations
  await, or a row that is not interactive until its add resolves — a design
  call, not a guard.
- **The drain deletes an op whose type it does not recognise** (JAV-101). Its
  dispatch is the one `op.type` reader that is not an exhaustive switch, so an
  unrecognised op falls through to `remove` unsent and unannounced. Out of
  reach of the type system only from *inside* one bundle: the PWA can serve an
  older cached one to a tab whose queue a newer one wrote.
- **A retry can quietly undo newer work** (JAV-100). A refused op stops holding
  up the queue, which is what lets later writes keep flowing — including later
  writes to the *same* row. Rename, get refused, rename again offline, then
  press *Reintentar* on the first: the older name wins and nothing says so. The
  add case is solved here because it fails loudly and permanently; this one
  fails quietly and can be undone by hand.
- **Drains are serialised per tab, not per queue** (JAV-98). `chain` is a ref
  in one React tree; the store is per-origin. Two tabs waking on the same
  reconnection both send, and the second `remove` is a no-op on a key that has
  already gone — so the duplicate leaves no trace.
- **A close naming an item the server cannot find is accepted** (JAV-97, the
  endpoint half). Guarded in the queue here; the endpoint still answers 200 and
  files less than it was told.
- **Every store call opens a connection and none are closed** (JAV-99). Which
  is why the reads needed a generation guard at all.
- **The `price-delete-guard` screenshots race the toast they capture**
  (JAV-102). That notice carries no action, so its window is three seconds, and
  a retry cannot bring a dismissed toast back — a slow runner is a hard failure
  rather than a flake. Pre-existing in shape, but these are four of the
  baselines this phase regenerated, so the margin is written down rather than
  left to be rediscovered.

One thing this phase *did* have to close, because it created it: **a
«Reintentar» makes non-idempotency reachable.** `savePrice` picks `POST` or
`PATCH` from a local price that a half-finished attempt has already
invalidated, so the retry this phase added would have 409'd for good on the
ordinary case of logging a first price. The write now converges by reading the
refusal as an answer about which verb was wanted. The rule is in AGENTS.md,
because the next control added to a notice will face the same question.

## What this closes

`19a`, `19b` and `19c`, and with them JAV-89. `20a` (scanning to add, phase 6)
is unblocked by the toast shape above: one optional action with a label.
