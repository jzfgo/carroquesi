# Removing the offline write queue

Design for taking the IndexedDB write queue out of the app and refusing writes
without a connection instead. Base branch is `feat/redesign-spec-v6`, never
`main`.

This supersedes `2026-07-31-offline-errors-undo-design.md` (phase 4b) in its
offline half, and reverts most of what PR #199 shipped the same day. That is
the cost, and it is stated here rather than discovered in the diff.

## What this is for

The queue is the most expensive machinery in the frontend and the least
visible. It is roughly 1,035 lines of source against 1,754 lines of test, and
it has produced its own defect class: five open issues (JAV-98, JAV-99,
JAV-100, JAV-101, JAV-103) are about the queue and nothing else. Every one of
them is a bug that cannot exist without it.

PRODUCT.md principle 6 is the one that applies: *complexity is earned*, and
*prefer a design that makes a failure impossible over one that handles it*. A
write that is never attempted cannot be lost, cannot be replayed twice, cannot
be drained by two tabs at once, and cannot sit refused in a sheet.

So the trade is taken deliberately: the app becomes read-only without a
connection, and the machinery that made it writable goes.

## Design authority

Two authorities are overruled here, both on purpose.

**PRODUCT.md principle 3 — «Never lose a write. Offline queueing is the
contract, not an optimization» — is dropped.** Not softened, not reworded:
removed, along with the operating-context line at :43 and the offline half of
pillar 4 at :34. A principle that the code no longer keeps is worse than no
principle, because it reads as a rule somebody violated.

**The handoff's `19a` is partly overruled.** Its argument — *a list without
signal is not broken* — survives in full for **reads**, which is where most of
its weight was. What goes is the part that assumed writes continue: the
per-row `--miel-0` dot for a line written here and not yet on the server, and
the band's promise that changes will send themselves.

Precedent for overruling the handoff is JAV-83's per-user board decision, and
the shape is the same: state the cost plainly, in the place somebody will look.

## Settled decisions

### The band stays

`ListNotice` is not deleted. Without a connection the list still says so, under
its own rubric, with the `CloudOff` glyph and «Sin conexión». What it loses is
everything that was about the queue:

- `offlinePromise()` and the `pendingCount` prop — there is nothing in flight to
  promise about;
- the `rejectedCount` row, its `CircleAlert`, and the *Ver cuáles* button that
  routed into «Cambios sin enviar»;
- `onShowRejected`.

It goes from four props to one. The doc comment needs rewriting rather than
trimming: its current justification is *"the queue drains itself when the
network is back, and a button would pretend somebody has to press it"*. The new
reason nothing there is red or actionable is different — there is nothing to
act on because nothing was accepted.

The band is also the only thing that makes the disabled controls legible. A
greyed-out input bar with no explanation is a broken app; the same bar under
«Sin conexión» is a state.

### A write that fails while `isOffline === false` is lost, and says so

This is the decision the removal turns on, and it is taken with open eyes.

`useIsOffline` is `!navigator.onLine` and nothing else. On a captive portal, or
in an aisle where the wifi is associated with no route to anywhere,
`navigator.onLine` is `true` — so `isOffline` is `false`, the gate is open, the
write is attempted, and it fails. Today the queue catches exactly that write.
After this change nothing does.

**Chosen: accept the loss and say it plainly in a toast.** No reachability
probe, no retry buffer — a buffer is the queue growing back with a smaller name.

The toast must not lie about what happened. «No se pudo guardar el cambio» is
true; anything implying a later attempt is not. `isRetryable` still governs
whether a *Reintentar* is offered, and on a network error (status 0) it is — a
retry here is a fresh attempt the person chose, not a promise the app made.

This is a real regression against today's behaviour in the app's defining
scene, and it is recorded under *Known limits* as well as here.

### The existing store is deleted on boot, and what was in it is lost

Every installed device already has a `cqs_offline` store, and some have pending
ops in them right now — writes the band promised «se enviarán solos» about.
There is no drain in the new bundle to keep that promise.

**Chosen: `indexedDB.deleteDatabase('cqs_offline')` once on boot.** The whole
removal ships in one PR, and no drain code survives the release that deletes it.

The alternative was keeping `useQueueDrain` alive for exactly one release to
drain what is there before deleting the store — the only option that loses no
write. It was declined: it delays the deletion behind a two-release sequence
and keeps the machinery alive for a case that empties itself within a day of
normal use.

So this is a one-time, real loss on real devices, not a hypothetical. It is
limit 5 below, and the deletion call needs a comment saying it can be removed
once the release that introduced it is no longer the one anybody is upgrading
from — otherwise it becomes permanent boot-time work for a store that no
longer exists.

### Writes only — the app still opens offline

Reads are untouched. The service worker shell cache, `cqs_list_cache_{listId}`
and `cqs_dashboard_cache_{userId}` all stay exactly as they are. Somebody in a
basement aisle still opens the app, still sees the dashboard, still opens a
list and reads it. They cannot change it.

### Optimistic updates and temp ids stay

`newTempId()` is not queue machinery. It exists because an add paints its row
before the POST answers, which is about latency and would be wanted with no
queue at all. It stays, and so does JAV-97 in full — the five `addItem` call
sites, and the fact that no component guards on a `tmp-…` id.

Worth being explicit, because it is the natural thing to assume this removal
fixes: **it does not.**

### One band, above the router, and every guard is silent

The condition belongs to the **device**, not to a list, a sheet or a screen.
So it is said exactly once, by `OfflineBand`, mounted in `App` above `<Routes>`
— outside every screen's chrome, over every sheet, unaffected by any scroll.

That replaces four separate statements, each of which was true only while its
own surface happened to be visible:

| was | now |
| -- | -- |
| `ListNotice`'s «Sin conexión · n cambios se enviarán solos» | gone; `ListNotice` is only refused writes |
| `DashboardScreen`'s own `.offline-banner` | gone |
| `CloseTripSheet`'s «Se guardará cuando vuelva la conexión» | gone |
| `LogPurchaseSheet`'s «Disponible con conexión» | gone |

Because the one band cannot be covered or scrolled away, **every guard is
silent** — including the four list-level ones and both dashboard ones.
`OFFLINE_REFUSAL` was added for those and then deleted in the same change: with
the band saying it, no call site needed a sentence at all.

**Three states, because reconnection is a change rather than a condition:**

- `offline` — persists for as long as it holds. It is a fact about now.
- `restored` — «De nuevo en línea», in `--success` tone, for `AUTO_DISMISS_MS`
  (imported from `Toast`, so the app holds one idea of how long a sentence
  takes to read). Driven by the `online` **event**, not by the value: mounting
  with a connection is not a transition, so a cold start cannot congratulate
  itself, and no previous value has to be remembered.
- `hidden`.

`isOffline` wins over `restored`, so losing the signal again mid-window says so
rather than continuing to congratulate.

**The layout cost, stated.** The band is a flex child of `#root` above the
router, so a screen below it can no longer claim a whole viewport without
pushing the document taller than one. Six screens subtract `var(--band-offset)`,
which is `0px` until `#root:has(> .offline-band)`. A variable rather than
`flex: 1` on each, because those six deliberately choose between `svh` and
`dvh` — they differ on the mobile browser's own chrome, and flattening them
would silently decide that question for all six.

The one case that still speaks is a write that **fails** after being attempted:
a different sentence («no se pudo…»), on a screen where the band is correctly
absent because `navigator.onLine` is `true`. See limit 1.

### A control that writes is disabled; one that reads is not

The line is **what the control does**, not what it leads to. Disabling a row
that merely opens an editor would make the app less useful in the aisle for no
safety gained — reaching a value is a read. So:

| disabled | left live |
| -- | -- |
| the circle (in/out of the cart), «volver a comprar» | opening the item, which is a read |
| rename *Guardar* and its Enter, «Sí, eliminar» | the «Nombre»/«Marca» rows that open the editors |
| tag *Guardar*, «Eliminar {campo}», and Enter | the suggestion chips, which only fill the field |
| every store control — add, remove, chips, Enter | — (all of them call `onSave` directly) |
| «Añadir» on a due suggestion | «Ignorar», which is written to this device |
| «Añadir a la lista» on a scan | «Editar», which only prefills the input bar |

Where a sheet has no local draft — `StoreEditSheet` is the case — the refusal
also sits in the mutator itself, because the keyboard reaches it without the
button.

`ItemActionSheet` is named in JAV-90 but no longer exists: phase 6 (#198)
replaced it with `ItemDetailSheet`. The sixth surface is `ItemCard`, whose
circle is the most-used write in the app.

### Controls are disabled, not tappable-then-refused

Gating every mutation behind `if (isOffline) { showToast(…); return }` alone
would fill the screen with controls known in advance to fail — the exact rule
phase 4b spent four review rounds enshrining, and it does not stop applying
because the queue is gone.

So the gate is two-sided: the handler returns early *and* the control carries
`disabled` / `aria-disabled`. The handler guard stays as the second line of
defence, because a control can be reached before React re-renders on the
`offline` event.

`DashboardScreen` already does exactly this and is the template
(`DashboardScreen.tsx:154`, `:296`, and the band at `:361`). This is that
pattern generalised to `ListScreen`, not a new design.

## Scope

**In.**

- Delete `lib/offlineQueue.ts`, `hooks/useQueueDrain.ts`,
  `components/UnsentChangesSheet.tsx` + `.css`, and their four test files.
- Reduce `lib/queueCopy.ts` to `isRetryable`, and move it into
  `lib/refusalCopy.ts` — AGENTS.md already says both halves of that rule belong
  at the same reach.
- Rewrite the six `enqueue` sites in `useListItems.ts`. Each is currently the
  body of an `if (isNetworkError(err))` catch branch; each becomes *roll back
  the optimistic update, toast, done*.
- Gate and disable every write path that has no gate today — the inventory is
  below, and «the item mutations» is not enough of an answer.
- Correct four references that outlive what they name: `sw.ts:40` («offline
  behaviour is handled in-app by the IndexedDB write queue»),
  `AuthContext.tsx:138` (naming `useQueueDrain` in a dependency-array comment),
  `refusalCopy.ts:6` (which says it lives *beside* `queueCopy`'s `isRetryable`,
  and becomes self-referential once that function moves in), and `ItemList.tsx:41`
  (the `notice` prop's comment).
- Add the one-time `indexedDB.deleteDatabase('cqs_offline')` on boot, with the
  comment saying when it can be removed.
- Reduce `ListNotice` to the band.
- Remove `queuedItemIds` from `ItemList` and `queued` from the row.
- Strip the queue coverage out of the three shared suites that carry it —
  `useListItems.test.ts`, `ListScreen.test.tsx`, `ListNotice.test.tsx` — test
  by test, per *Testing and verification*. Two of those tests **invert** rather
  than disappear; deleting them wholesale would drop the rule they guard.
- Delete the eight `offline-band-*` / `unsent-changes-*` visual baselines and
  the `goOffline` / `addOffline` helpers in `frontend/tests/smoke.spec.ts`,
  replacing the two offline specs with one that asserts the band and a
  disabled input bar.
- Docs: PRODUCT.md :34, :43, :109; AGENTS.md lines 86–96; README.md; mark the
  two offline specs superseded.
- **ADR-013**, because this changes what a write means.

**Out.**

- Any backend change, and therefore any migration.
- The read caches, the service worker, `sw.ts`.
- JAV-97 (temp ids), JAV-105 (the online 403/404 arrivals), JAV-106 (the read
  path's «Error al cargar la lista»). All three are untouched by this and stay
  open.
- Any reachability probe. Decided against above.

## Every write, and what guards it

The audit, because «gate the mutations» is the kind of instruction that leaves
one out — and the one it would have left out is the most expensive write in the
app.

**Already gated — nothing to do.** These take the `if (isOffline) { toast;
return }` shape today, which is the pattern this change generalises:

| Write | Where |
|---|---|
| list rename, emoji, set-default, delete | `ListScreen.tsx:182`, `:202`, `:224`, `:241` |
| receipt upload | `ListScreen.tsx:1056` (disabled) |
| feedback, list create | `DashboardScreen.tsx:154`, `:296` |
| price save | `LogPurchaseSheet.tsx:231` (disabled) |

**Queued today — these are the change.** All six `useListItems` mutations, plus
one that is easy to miss:

| Write | Where |
|---|---|
| `addItem`, `togglePurchased`, `removeItem`, `updateTag`, and the other two enqueue sites | `useListItems.ts` (six `isNetworkError` branches) |
| **`handleCloseTrip`** | `ListScreen.tsx:439`, enqueues at `:480` — **no `isOffline` gate today** |

`handleCloseTrip` is called out because it is the highest-stakes write in the
app — a whole shop and a money total — and because `closePurchase` is a member
of the op union being deleted. Left ungated it becomes a write that fails with
a toast at the worst possible moment, so it needs the two-sided gate more than
anything else in the list.

**Were ungated, now gated.** These attempted-then-failed rather than refusing
up front, which made them the exception to the rule everything else keeps:

- `ListMembersSheet.handleRemove` — backs both «Expulsar» and «Salir»; the
  guard sits ahead of the optimistic filter, so no row leaves the sheet for a
  write that will not happen
- `ListMembersSheet.handleCopyInvite` — creating an invite is a POST. Gated
  with `handleRemove` rather than left behind: one sheet with one live write
  and one dead one is the inconsistency this pass exists to remove
- `clearItemPrice` — covered by `handleDeletePrice` one level up

Still outside the gate, deliberately: **push token registration** (not a write
somebody asked for), the **board picker** (a per-device preference that travels
nowhere), and every **read retry** — `ListMembersSheet`'s «Reintentar», and the
refetches in `ItemList`, `DashboardScreen` and `InviteScreen`. Refusing a read
would leave somebody looking at an error with no way to try again.

The consequence worth stating: **the price path's existing `disabled={!canSave
|| !!isOffline}` becomes the whole answer for prices.** That is the precise
sense in which JAV-103 is closed *by decision* rather than by fix — and it is
also why limit 1 below matters, since that gate is the one `navigator.onLine`
holds open on a dead network.

## Frontend

| File | What happens |
|---|---|
| `lib/offlineQueue.ts` | deleted (347) |
| `hooks/useQueueDrain.ts` | deleted (325) |
| `components/UnsentChangesSheet.tsx` `.css` | deleted (213) |
| `lib/queueCopy.ts` | `isRetryable` moves to `refusalCopy.ts`; rest deleted (~150) |
| `hooks/useListItems.ts` | six `enqueue` branches → rollback + toast |
| `components/ListNotice.tsx` | four props → one; `offlinePromise` and the rejected row go |
| `components/ListScreen.tsx` | drop the sheet, `pendingItemIds`, the drain wiring; extend the gates |
| `components/ItemList.tsx` | drop `queuedItemIds`; keep `notice` |
| `components/ListMembersSheet.tsx` | import `isRetryable` from its new home |
| `hooks/useIsOffline.ts` | unchanged, and more load-bearing than before |

Net deletion is around 1,035 source lines and 1,754 test lines, less what the
rewritten catch branches and the new gates add back. The gross number
oversells it: six branches are rewritten rather than removed, and every write
path gains a gate it did not have.

## Testing and verification

Queue coverage is not confined to the four dedicated suites. It is threaded
through three shared ones, and the distinction that matters is **delete vs
rewrite vs invert** — a suite that merely *asserts through* the queue is
usually testing a rule that outlives it.

### Deleted outright (1,754 lines)

| Suite | lines |
|---|---:|
| `lib/offlineQueue.test.ts` | 446 |
| `hooks/useQueueDrain.test.ts` | 760 |
| `components/UnsentChangesSheet.test.tsx` | 401 |
| `lib/queueCopy.test.ts` | 147 |

`queueCopy.test.ts` is the one to read before deleting: whatever it asserts
about `isRetryable` moves to `refusalCopy`'s suite along with the function.

### `components/ListNotice.test.tsx` — 7 tests, 4 go

- delete «promises the queued changes will send themselves»
- delete «agrees in number for a single change» (the singular/plural of
  `offlinePromise`, which is being deleted)
- delete both of `describe('ListNotice — refused writes')`
- keep «says nothing at all with a connection», «states the fact and stops when
  nothing is queued» — the latter becomes the *only* offline case and should be
  renamed, since "when nothing is queued" stops meaning anything
- keep «offers nothing to press», and it gets stronger: it is now structural
  rather than conditional

### `hooks/useListItems.test.ts` — the invert cases live here

- **delete** `describe('useListItems — write queue on network error')`, except
  as noted below
- **invert** «addItem: keeps temp item in list on network error». After this
  change a network error must **remove** the temp row, not keep it. Same test,
  opposite assertion — the single most important test in the change, because it
  is the one that proves the rollback replaced the queue rather than joining it
- **keep, minus its `enqueue` assertion** «addItem: removes temp item on server
  error (ApiError)» — that behaviour is unchanged
- **delete** «queues the tap instant too, so a late drain still files into the
  right trip» — there is no late drain
- **rewrite** «offers the undo once the queue has taken the write». The rule it
  guards survives in full (*an undo is shown only once the write it undoes has
  settled*); what changes is what settling means. Renaming it to name the
  server's answer keeps the rule and drops the queue
- **keep untouched** `describe('useListItems — stale-while-revalidate cache')`
  — that is the read cache, explicitly out of scope
- remove the `vi.mock('../lib/offlineQueue')` block at the top, and with it the
  three-line comment explaining why `enqueue` alone is stubbed

### `components/ListScreen.test.tsx`

- remove the `useQueueDrain` mock (`:50`) and the partial `offlineQueue` mock
  (`:70`), plus the comment explaining why the second is partial
- **rewrite** `describe('with no connection')` (`:1648`) — it currently drives
  `pendingItemIds` through the mocked drain. It becomes the band plus the
  disabled controls, which is more coverage than it has now, not less
- **delete** the three `enqueue` assertions in `describe('closing a trip')`
  (`:1996`, `:2035`, `:2057`) — the offline close-trip path they cover no
  longer exists

### New tests

- **Every gate gets a test that fails when the gate is deleted**, per this
  project's usual discipline. A gate with no failing test is a comment. That is
  two per mutation: the handler returns early, *and* the control renders
  disabled.
- The six rewritten catch branches each need a rollback test. Only `addItem`
  has one today (as the invert above); the other five are new.
- **The documented limit gets a test.** Reject the fetch with a `TypeError`
  while leaving `navigator.onLine === true`, and assert the write is lost with
  a toast and no queue call. It is worth writing precisely *because* it is the
  regression — a limit with a test is a decision, one without is a surprise.

### E2E and baselines

- Delete the eight `offline-band-*` / `unsent-changes-*` baselines and the
  `goOffline` / `addOffline` helpers in `frontend/tests/smoke.spec.ts`.
- One spec replaces the two that exist: go offline, assert the band, assert the
  input bar is disabled, assert no row was added. `context.setOffline` drives
  `navigator.onLine`, so E2E covers the case the gate *does* catch — and by
  construction cannot cover the dead-network case, which is why that one is a
  unit test.
- `hooks/useIsOffline.test.ts` is unchanged.
- Regenerate baselines only after the band's final copy is settled.

## Known limits

1. **A write attempted on a connected-but-dead network is lost.** Captive
   portals and associated-but-routeless wifi both report `navigator.onLine ===
   true`, so the gate is open and there is no queue behind it. The person gets
   a toast and a *Reintentar* that is a fresh attempt, not a promise. This is a
   regression against the queue in the app's defining scene, accepted
   knowingly.
2. **Nothing composed offline survives.** A list tidied on the sofa with the
   wifi down is not written down anywhere; the controls refuse it at the point
   of the tap rather than losing it later, which is the honest version of the
   same limit.
3. **Two-device concurrency is unchanged**, because it was never the queue's
   problem — the 5 s poll still owns it.
4. **The handoff's `19a` per-row dot has no successor.** No line is ever
   "written here and not on the server" any more, so the state it depicted
   cannot occur.
5. **Whatever is queued on a device at upgrade time is lost**, once, when the
   store is deleted on boot. Decided above. It is the only limit here with a
   fixed end: it stops applying as soon as every device has taken the release.

## What this closes

Cancel outright — these are queue-only and cannot recur:

- JAV-98 — the drain is serialised per tab, not per queue
- JAV-99 — every queue call opens an IndexedDB connection, none are closed
- JAV-100 — retrying a refused edit can re-apply it over a newer one
- JAV-101 — the drain deletes an op whose type it does not recognise
- JAV-103 — `savePrice` never reaches the queue

Explicitly **not** closed, and worth re-stating on each issue so nobody assumes
otherwise:

- **JAV-97** — temp ids are about latency. Unchanged in full, and still the
  thing to do before the next phase.
- **JAV-105** — arrivals 3–5 are online 403/404 paths. The offline-drain
  caveat in it goes away, which simplifies the eventual fix slightly.
- **JAV-106** — the read path. Untouched.

JAV-89 (phase 4) stays Done; this does not reopen it. The reversal is recorded
here and in ADR-013 instead.
