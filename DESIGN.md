---
name: CarroQueSí
description: A shared shopping list that becomes a receipt as you shop
colors:
  paper-0: "#eef1f5"
  paper-1: "#e3e7ed"
  paper-2: "#d5dae2"
  paper-edge: "#b4bac4"
  paper-lift: "#eef1f5"
  rule: "#e3e7ed"
  rule-dashed: "#b4bac4"
  board-kraft: "#c2a982"
  board-lino: "#c8c2b3"
  board-salvia: "#a9b8a5"
  board-niebla: "#a9b6c6"
  board-barro: "#c59a8a"
  board-pizarra: "#a8a8ad"
  ink-0: "#15161b"
  ink-1: "#353742"
  ink-2: "#6a6d7a"
  ink-3: "#94969f"
  tinta-0: "#1a3fa0"
  tinta-1: "#2c56c1"
  verde-0: "#2f7a4a"
  tomate-0: "#c0392b"
  miel-0: "#c9941f"
typography:
  display:
    fontFamily: "Bree Serif, ui-serif, Georgia, serif"
    fontSize: "56px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Bree Serif, ui-serif, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.1em"
  written:
    fontFamily: "Patrick Hand SC, Bradley Hand, cursive"
    fontSize: "18.9px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.045em"
  written-sm:
    fontFamily: "Patrick Hand SC, Bradley Hand, cursive"
    fontSize: "13.5px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.05em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "17.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  pill: "999px"
  sheet: "2px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
  "9": "96px"
components:
  button-primary:
    backgroundColor: "{colors.tinta-0}"
    textColor: "{colors.paper-0}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.tinta-1}"
  button-quiet:
    backgroundColor: "{colors.paper-0}"
    textColor: "{colors.ink-0}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  chip-filter:
    backgroundColor: "{colors.paper-1}"
    textColor: "{colors.ink-1}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  chip-filter-active:
    backgroundColor: "{colors.tinta-0}"
    textColor: "{colors.paper-0}"
  input-field:
    backgroundColor: "{colors.paper-1}"
    textColor: "{colors.ink-0}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  sheet-paper:
    backgroundColor: "{colors.paper-0}"
    rounded: "{rounded.sheet}"
    padding: "0 0 8px"
  row-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-0}"
    padding: "9px 14px"
    height: "46px"
---

# Design System: CarroQueSí

> **This file is the system.** It describes CarroQueSí's visual world as
> decided in the 2026-08 redesign, and every token it names exists in
> `frontend/src/colorsAndType.css` — build against it directly. Where this file
> and the current UI disagree, **this file wins** and the UI is what needs to
> change. What has been adopted and what is still pending is tracked in Linear
> on the redesign epic (JAV-117), not here.
>
> The frontmatter carries light-mode values; every colour has a hand-authored
> dark counterpart in `colorsAndType.css`, noted in prose below. When you
> change the system, change the tokens, this file, and Linear together.

## Overview

**Creative North Star: "El Ticket"**

_El ticket_ is what a receipt is called in Spain, and it is the whole idea.
This is not a shopping-list app that happens to store prices; it is a list that
**becomes a receipt as you shop**. Before the shop, a line is an instruction —
six of these, that brand, that shop. After the shop, the same line is a record —
what was actually bought, what it actually cost. Two different documents, so
two different voices: you **write** the list; the till **prints** the receipt.

The physical model is **paper on cardboard**. An open list is a sheet
(`--paper-0`) lying on a board (`--board-*`, "el tablero") — a flat colour
behind the paper, never behind content. Handwriting (Patrick Hand SC) is what
the household wrote; mono (JetBrains Mono) is what a machine printed; both
sheets carry their titles in the app's serif, because on real stock the header
is pre-printed. On either sheet, ink is **grayscale**: the two hands already
carry the state, so colour has nothing left to do there.

**The paper stays inside the list** (_el papel se queda dentro de la lista_,
`16c`). Board, sheet, veil and handwriting are the language of an _open list_;
everywhere else — dashboard, sign-up, settings, search — is a flat surface in
the same palette. So entering a list means something. That confinement is the
single most load-bearing decision in the system; several otherwise-good designs
were rejected to keep it.

**Key characteristics:**

- One sheet on a board; the receipt stack below it is thinner stock
- Handwriting for intent, monospace for record, serif for pre-printed
- Grayscale ink on the paper; the board is the only material colour in frame
- Three item states — pending, in the cart, bought — and no strikethrough,
  ever
- Flat by default; relief is reserved for objects that are genuinely separate,
  and never changes rank with the light
- Amounts sit in one right-aligned tabular column in both states; only their
  truth-value changes

## Colors

Cool paper, cool ink, one material surface underneath. Hue is spent almost
nowhere.

### Primary

- **BIC Pen Blue** (`--tinta-0`, `#1a3fa0`): the app's one brand accent —
  links, focus rings, primary buttons, active filter chips, the in-cart state.
  Named `tinta` after the ballpoint it came from. In dark it lifts to
  `#91a8ff`, because the light value fails contrast on a near-black ground.

### The boards

Six board hues replace the single wooden table of the previous system. The
board is the cardboard an open list's sheet lies on — visible around and
through the paper (the seam, the die-cut), never behind content:

`--board-kraft` `#c2a982` · `--board-lino` `#c8c2b3` · `--board-salvia`
`#a9b8a5` · `--board-niebla` `#a9b6c6` · `--board-barro` `#c59a8a` ·
`--board-pizarra` `#a8a8ad`

Each hue pairs with its own `--board-ink-*`; the pair is computed per hue, not
chosen, and every pair holds 4.5:1 in both lights (measured: min 7.19:1 in
light, 11.81:1 in dark). In light all six inks resolve to `#15161b`; in dark
they flip to light ink — `#e4ded3` on warm boards, `#d9dbe1` on cool ones.

**Identity is shared; orientation is personal** (_la identidad es compartida;
la orientación es de cada uno_, rule 20). A list's emoji and name are seen by
the whole household and are never local. The board only helps _you_ find the
list, so it is yours: per person and per list (`UserListPref`), assigned
automatically on first entry by rotating the six values so two of your lists
never start alike, changeable by any member for themselves, never propagated.
Neither is explained in the UI: they are told apart by where they live.

**A tone that loses light gains colour** (_un tono que pierde luz gana color_,
rule 18). In dark the boards keep their hue and gain saturation as they drop a
band (`#2a1d0a`, `#232014`, `#12240f`, `#0f1e33`, `#331409`, `#1b1c24`)
instead of turning into tinted greys. "La verde" has to stay a sayable name at
night.

### Semantic

Semantic only, never decorative. Dark counterparts in parentheses:

- **Grocer Green** (`--verde-0`, `#2f7a4a` / `#7bc68b`): a purchase confirmed,
  a price recorded, a toast.
- **Red Pen** (`--tomate-0`, `#c0392b` / `#e68a82`): destructive actions,
  errors, corrections.
- **Highlighter** (`--miel-0`, `#c9941f` / `#e6c56a`): attention, promotion,
  due-again. At 2.4:1 on the sheet it is **never a text colour**.

### Neutral

- **Composition Paper** (`--paper-0`, `#eef1f5` / `#252731`): the page and the
  sheet face.
- **Recessed Paper** (`--paper-1`, `#e3e7ed` / `#2e313b`): inputs, list beds,
  the sunken state.
- **Hover Paper** (`--paper-2`, `#d5dae2` / `#3c4050`): pointer feedback only.
- **Lifted Paper** (`--paper-lift`): a modal sheet above the page. In light it
  equals `--paper-0`; in dark it steps **up** to `#2e313b` — see the dark
  rules below. `--series` (secondary chart series) follows the same logic from
  `--paper-2`.
- **Paper Edge** (`--paper-edge` → `--border`, `#b4bac4` / `#4a4d57`): borders
  and dividers outside a sheet. `--border-strong` (`#9ca3ae` / `#52555f`) is
  the grabbable step — the status circle's stroke.
- **Row rules**: `--rule` (`#e3e7ed` / `#33363f`) is the solid 1px divider
  between stacked rows; `--rule-dashed` (`#b4bac4` / `#414450`) is the dashed
  section divider, deliberately a step stronger — dashes have half the pixels
  (rule 19). They are two strokes, not one token; do not merge them.
- **Ink ramp**: `--ink-0` (`#15161b` / `#f0f1f5`) → `--ink-1` (`#353742` /
  `#c2c4cc`) → `--ink-2` (`#6a6d7a` / `#92959f`) → `--ink-3` (`#94969f` /
  `#6f727c`). Only the first three carry text; `--ink-3` is for borders and
  inactive marks, never words. Its two remaining `::placeholder` consumers are
  a recorded WCAG 1.4.3 defect, tracked on the epic.

### Named Rules

**The Grayscale Ink Rule** (_dentro de la hoja, solo tinta_, rule 2, `11c`).
Inside a sheet, ink is achromatic, and what the household wrote is _written_:
names, quantities, brands, shops, prices, totals are ink, with no UI glyph
ever replacing a word of content. Icons live in the affordance — the circle,
the chevron, the pencil. `tinta` and `verde` both resolve to `--ink-1` on
paper, and that is the point: the typography already encodes who wrote each
line, so colour would repeat a signal that is carried better. This governs
**content**, not controls — the status circle keeps its colour because it is
an affordance reporting its own state, not ink on paper. Outside a sheet the
palette applies in full.

**The Surface-Relative Ink Rule** (_la tinta se elige por la superficie que
hay detrás_, rule 4, `11c`). A token does not pass or fail in the abstract —
it passes _over something_. Measured against the shipped tokens: `--ink-2` is
valid on `--paper-0` (4.54:1 in light, with only 0.04 of headroom over the AA
floor — do not darken the paper beneath it) and **not** on the recessed rungs
(4.15:1 on `--paper-1` in light, 4.34:1 in dark), where secondary text becomes
`--ink-1` (9.5:1 / 7.5:1). The same duty applies to every new pairing: measure
against the surface it will actually sit on, in both lights.

**The Dim-By-Ink Rule** (_atenuar es cambiar de tinta, no bajar la opacidad_,
rule 5, `11c`). An `opacity` on a row eats the contrast of its text and its
affordance too. Secondary is said with `--ink-2` and weight; controls stay at
full opacity.

**The Dark-Is-A-Re-Theme Rule.** Dark mode is authored, not inverted — the
same desk at night. It is delivered by `@media (prefers-color-scheme: dark)`
plus `.theme-light` / `.theme-dark` overrides for the three-way appearance
switcher; the override classes are **full mirrors** of the token set, because
a token omitted from them silently falls through to the media query. Every
colour has a hand-picked dark counterpart in `colorsAndType.css`; never derive
one with `filter: invert()`. Two rules govern the authoring:

- _En oscuro lo secundario no se hunde: se levanta menos_ (rule 19). There is
  no room below the sheet at night. Everything that was "one tone less" in
  light becomes one tone **more** in dark, always below the primary — which is
  why `--paper-lift` and `--series` step up instead of down. Corollary: thin
  and dashed strokes go up one ink step, because they have half the pixels and
  read half as well at the same colour (`--rule-dashed`, and the dashed status
  circle).
- _Un tono que pierde luz gana color_ (rule 18) — see _The boards_.

**The Surfaces-Keep-Their-Colour Rule.** Grayscale is a rule about _content_,
not about the world. The board stays material and the paper stays cool-blue on
top of it. Desaturating the surface as well produces a monochrome mockup, not
a photograph.

## Typography

**Display Font:** Bree Serif (with Georgia, serif)
**Body Font:** Geist (with system-ui)
**Written Font:** Patrick Hand SC (`--font-written`, with Bradley Hand,
cursive)
**Data Font:** JetBrains Mono (with SF Mono, Consolas)
**House Voice:** Caveat (`--font-hand`)

**Character:** each face has a reason to exist. Bree Serif is the pre-printed
stationery. Geist is the application talking. Patrick Hand SC is the household
writing a list. JetBrains Mono is a machine printing a total. Caveat is the
brand's own hand — the wordmark, "¡listo ✓" — and a different thing from the
household's writing; don't mix them. A sixth voice would have to justify
itself against those five.

### Hierarchy

- **Display** (400, 56px, 1.15): sign-in and waitlist screens only.
- **Headline** (400, 20–24px, 1.15): screen titles in the list header and
  dashboard, from the `--fs-20` / `--fs-24` steps.
- **Title** (600, 24px, 1.3): section titles inside sheets.
- **Body** (400, 16px, 1.5): the default. **15px (`--fs-15`) is the floor for
  content text** — anything a person reads to decide something. Labels and
  meta lines go smaller by design and are governed by contrast instead. One
  declared exception: `.stamp`, 11px uppercase at 0.09em, because the stamp is
  a mark and the 48px row containing it is the target.
- **Label** (600, 12px, 0.1em, uppercase): eyebrows and section headers.
- **Written** (700, `calc(21px * var(--written-scale))` = 18.9px, 0.045em,
  uppercase): content the household wrote. The small step is
  `calc(15px * var(--written-scale))` = 13.5px for written meta.
- **Data** (600, 17.5px, 0.02em, uppercase, tabular): printed content — all
  prices, EANs, totals. Money is `€ 5,34` — symbol first, comma decimal.

### Named Rules

**The Written-Or-Printed Rule** (_escrito o impreso, según quién lo puso ahí_,
turn 28). Hand = intention; mono = record. Which face a line takes is decided
by who put it there, never by which screen it is on. A scanned receipt line is
shown verbatim in mono; the app's interpretation is an annotation below it.

**The Cap-Height Rule.** Faces are matched by measured **cap height**, never
by px value. Patrick Hand SC at 18.9px measures a 13.03px cap; JetBrains Mono
only reaches that at **17.5px**. Setting both to the same number leaves the
receipt a third too small. Any new face pairing is calibrated the same way,
with a per-face optical scale factor rather than a shared size.

**The Tabular Numerals Rule.** Every figure in the **amount column** — price,
unit price, total — plus every EAN is `font-variant-numeric: tabular-nums` in
JetBrains Mono. Amounts must stay aligned across rows; proportional digits
break the column and the column is the point. The exception is the quantity on
a pending line: it sits inline in the meta row, it is something the household
_wrote_, and alignment is not a property an inline figure has.

**The Uppercase Tracking Rule.** All caps costs the word-shape cue people scan
by, so tracking is always added back. Never set caps at default tracking. How
much depends on the face as much as the size — the written face is tracked
wider than the mono despite setting larger — so each role carries its own
figure in its frontmatter entry and this rule names none of them. Negative
tracking belongs to large lowercase type only and never appears on caps: a
negative value on an uppercase role is always a sign error, not a choice.

**The Provisional Face Rule.** The written face is not settled and an
appearance section in settings is planned, so no face is hard-coded in a
component. Type always resolves through `--font-written`, `--font-mono`,
`--font-display`, `--font-sans` or `--font-hand`, and written sizes derive
from `--written-scale` — so a face can be swapped at runtime without touching
a stylesheet. `--font-hand` (Caveat) and `--font-written` (Patrick Hand SC)
are **different roles**; see _Character_ above.

## Layout

Mobile-first and single-column; the app is designed for one hand in a
supermarket aisle, not a desktop. `#root` caps at 1126px and is centred with
hairline side borders, so a wide window reads as a phone on a page rather than
a stretched app.

Spacing follows the 4px base scale (`--space-1`…`--space-9`); the screen's
side margin is **20px**. Sheet interiors carry no side padding of their own
because the paper bleeds to its own edges.

Measured geometry, final in the handoff:

- **Rows**: list rows 46px short, 54px with meta; list-panel rows 50/56px;
  settings rows 52px; item-detail rows 48px; the seal row 48px.
- **Status circle** 24px, stroked with `--border-strong`. Emoji column in the
  panel 36px, glyph 28px.
- **Pickers**: board swatches 52px; the appearance segment 44px.

Touch targets are floor-tested, not assumed: `--hit-min: 44px` (the WCAG/iOS
minimum), `--hit-tap: 48px` for primary affordances, `--hit-sheet: 56px` for
sheet rows and large CTAs. The `.hit` pattern (transparent padding plus
negative margin) grows the target without moving anything, and
`box-sizing: border-box` goes on every bordered control. The list header is
56px and sticky; the Smart Input bar is fixed to the bottom; bottom sheets and
toasts respect `env(safe-area-inset-bottom)`.

### Named Rules

**The One-Place Rule** (_un dato, un sitio_, rule 3, `11c`). One place per
screen for any given figure. A total, a count, a price appears once; a second
copy will disagree with the first eventually.

**The Two-Targets Rule** (_dos objetivos táctiles por fila_, rule 7, `11c`).
A row has exactly two touch targets: the circle and the row itself. Painted
things may be small; touchable things never go below 44px (`.hit`).

**The Aisle Wins The Tie Rule.** When the composing-at-home moment and the
in-store moment want different layouts, design for the store. It is the harder
scene and the one the product exists for.

## Elevation & Depth

**Flat by default.** Surfaces sit flat and separate with a 1px hairline or a
change of paper tone. Relief is reserved for objects that have genuinely left
the page — and for the sheet on its board.

### Named Rules

**The Same-Relief Rule** (_el orden no cambia con la luz; cambia cómo se
dibuja_, rule 17). The sheet is always above the board. In light, relief is
shadow; in dark, it is the edge — because a dark shadow on a dark ground is
taken on trust, and **if you can't see it, it isn't there**. The sheet's CSS
is identical in both modes: it always carries `border-top` (`--edge-lit-*`),
`border-bottom` (`--edge-cast-*`) _and_ `box-shadow` (`--sheet-cast-*`), and
each mode switches off what it doesn't use through the tokens.

- **Light**: the edges are `transparent`; the list sheet casts
  `--sheet-cast-list` (taller, softer — thicker stock) and the receipt
  `--sheet-cast-receipt` (shorter, finer). The receipt's cut edge carries
  `--sheet-rim`, a **1.5px** light rim — 58% white over the first pixel, 22%
  over the remaining half, then nothing. The falloff is the point: a flat band
  reads as a drawn line, not a lit edge. Do not round it to 2px to match
  `--r-sheet`; the rim and the sheet radius are unrelated geometry. It is a
  background layer, not a border: it must paint above the veil.
- **Dark**: the rim is `none` and relief moves to the edges — `--edge-lit-1/2/3`
  at **15 / 8 / 4%** white on top, `--edge-cast-1/2/3` at **55 / 45 / 30%**
  black below, by height rung (the list sheet down to inline paper scraps).
  The 4% rung ships untested on OLED/cheap-LCD hardware by decision (2 Aug 2026) — accepted risk, on record in the handoff; don't re-flag it.
- **One shipped exception, on purpose**: dark sheets **keep a cast shadow**
  (`--sheet-cast-list: 0 3px 0 -1px…, 0 8px 16px -7px…`;
  `--sheet-cast-receipt: 0 3px 0 -1px…`). The handoff README says dark
  switches the shadow off, but the approved dark canonical screen (`33a`)
  carries it, and the document beats the README. The tokens follow the
  document.
- The **veil** (`--veil`) is a multiply layer that dims a settled receipt
  sheet against the live one, header included: 4% in light, 20% in dark.
- The **die-cut hole** shows `--void`: `transparent` in light (the board shows
  through), `#0a0a0d` in dark — deeper than any board.

**The Ruled-Not-Raised Rule.** Separation inside a screen is a hairline
(`--rule`, `--rule-dashed`) or a tone change, never a shadow. Shadows are
reserved for: bottom sheet, dropdown menu, toast, dragging card, and the
sheets on the board.

**The Sheets-On-The-Board Exception.** The list sheet and the receipts are
genuinely separate physical objects, so each casts real relief — onto the
**board**, not onto each other. The thicker list stock casts deeper than the
thin till roll; the grammage difference is carried by the casts and the veil.
This is the **only** sanctioned in-page relief and it does not generalise to
cards, rows, or sections.

### Shadow Vocabulary

For objects that leave the page (values are the light set; dark uses
pure-black equivalents at higher opacity):

- **`--shadow-sm`**: a card lifted off the stack; suggestion popovers.
- **`--shadow-md`**: dropdown and avatar menus.
- **`--shadow-lg`**: toasts and a card being dragged.
- **`--shadow-sheet`**: bottom sheets — note it casts **upward**.

All four are two-layer (a tight contact shadow plus a soft ambient one) and
tinted cool blue-grey in light so they read against cool paper instead of
smudging over it.

## Shapes

Two radius languages, and which one applies says what a thing is.

**Interface** is gently rounded: `--r-xs` tags, `--r-sm` small buttons,
`--r-md` inputs and menus, `--r-lg` cards and the Smart Input bar, `--r-xl`
large surfaces, `--r-pill` filter chips and the printed seal. Bottom sheets
round their top corners only (`16px 16px 0 0`), because they arrive from
below.

**Paper** is cut, not rounded: sheets use `--r-sheet` (2px), near-square.
Paper does not have a border radius; a sheet with a 14px corner reads as a
card, and the whole distinction collapses.

Borders are hairlines (1px), or 1.5–2px where a control must feel grabbable —
the Smart Input row, the status circle, a focused field.

### Named Rules

**The Cut-Edge Rule.** Anything representing paper gets the sheet radius
(`--r-sheet`, `rounded.sheet`). Anything representing interface gets the
interface scale. Never mix them on one element.

**The Dashed-Means-Not-Yet Rule** (_un hueco vacío no es un control_, rule 6,
`11c`; _discontinuo es rellenable, macizo ya existe_, turn 28). Dashed means
"not real yet", and only that: an empty tag slot, a suggestion's unwritten
row, a proposed price awaiting confirmation, the offline status circle. Solid
already exists. Because dashes have half the pixels, a dashed stroke takes a
colour one step stronger than its solid equivalent (rule 19 corollary —
`--rule-dashed`).

## Interaction

### Named Rules

**The One-Path Rule** (_una acción, un camino_, rule 1, `11c`). One action,
one way, same control and name everywhere. A second path means one of them is
redundant. And the surviving path must be visible without hunting: if it needs
explaining, it isn't solved.

**The Already-Told Rule** (_no preguntes lo que ya te han dicho_, rule 8,
`11c`). Typing "kg" picks the unit; the form derives and shows the result
instead of asking for a declaration.

**The Paper-Wins Rule** (_el papel no se discute_, rule 9, `11c`). A scanned
receipt line is shown verbatim in mono; the app's interpretation is an
annotation below it — visually distinguishable, always editable, never
asserted. No sum is ever adjusted to reconcile.

**The Confirmed-Price Rule** (_ningún precio sin confirmar_, rule 10, `11c`).
Every amount in history is one someone confirmed — the precondition for ever
detecting price rises. An inherited or suggested amount renders dashed and
does not enter history until confirmed.

**The One-Primary Rule** (_un formulario, un primario_, rule 11, `11c`).
Label above field, one 48px primary, destructive separated, closing does not
save.

**The Empty-State Rules** (`16c`). Every empty offers the action that fills
it, in the place where it will be done (_todo vacío ofrece la acción que lo
llena_). The mascot appears once per session at most, and only where there is
nothing behind it (_la mascota, una vez por sesión como mucho_). "All bought"
is not an empty, it is a finish: the pending sheet disappears, the day's
receipt takes its place with the total, and one Caveat line — "¡listo ✓" —
says so. No confetti, no button.

### Motion

`--dur-fast` 120ms, `--dur-base` 200ms, `--dur-slow` 320ms; `--ease-out` by
default, `--ease-spring` for sheets only. Press is scale 0.97 on buttons, 0.99
on cards, ~120ms ease-out, **no colour change** — a finger covers it. Sheets
open with `--ease-spring` at 320ms. No parallax, no scroll-jacking, no
`backdrop-filter`.

## Components

There is **no shared button class** in this codebase; every component builds
its controls from tokens directly. That is a real property of the system, not
an oversight to be tidied away silently — but it means the rules below are the
contract, since no stylesheet enforces them.

### Buttons

- **Shape:** gently rounded (`--r-md`), pill for filter chips (`--r-pill`).
- **Primary:** `--accent` ground, `--accent-fg` text, 600 weight, min 44px
  tall.
- **Hover / Focus:** background shifts to `--accent-hover`; focus shows
  `--focus-ring` (`0 0 0 3px` of the accent at 30%). No lift, no glow.
- **Quiet:** transparent ground, `--border` hairline, `--ink-0` text.
- **Destructive:** `--danger` text on transparent, or `--danger` ground when
  the action is the sheet's primary confirm.
- **Disabled:** `--border` ground or 40–50% opacity, plus
  `cursor: not-allowed` — never a dimmed row (_The Dim-By-Ink Rule_).

### Chips

- **Filter chip:** `--paper-1` ground, `--border` hairline, pill, 13px.
- **Selected:** `--tinta-0` ground, `--accent-fg` text, border matches ground.
- **Tag chip:** `--paper-1`, 5px radius, 11.5px — a data label, not a control.
- **Dashed chip:** a slot that is empty or an action not yet taken.

### Cards / Containers

- **Corner:** `--r-lg` for list cards; `--r-sheet` for paper sheets.
- **Background:** `--paper-0`; `--paper-1` when recessed; `--paper-lift` for a
  modal sheet above the page.
- **Shadow:** `--shadow-sm` at rest, `--shadow-lg` while dragging.
- **Border:** 1px `--border`.
- **Row dividers:** 1px `--rule` between stacked rows; `--rule-dashed` between
  sections.

### Inputs / Fields

- **Style:** `--paper-1` ground, 1.5px `--border`, `--r-lg` radius.
- **Focus:** border becomes `--accent`; the ring is on the wrapper, not the
  input, so the whole control reads as focused.
- **Placeholder:** `--ink-2`. Not `--ink-3` — the shipped components still use
  `--ink-3` and that is recorded as a defect (see _Neutral_).
- **Error:** `--danger` text beneath, never colour alone.

### Navigation

The list header is 56px, sticky, `--paper-0`, with a 1px bottom hairline. Back
is an accent-coloured text button on the left; the title is Bree Serif at the
headline size, absolutely centred and truncated; the menu is on the right.

**Searching takes the title slot** (`21b`, placed by `5c`): the pill replaces
the title and the action cluster inside the same 56px row — back stays as the
way out, the menu waits until the search closes. The pill is paper-0 with the
1.5px accent as a shadow ring (a fractional border renders unevenly), with the
close disc inside it. It eases in over `--dur-base`; closing returns the store
chips with the same motion. Implemented per JAV-190 (2026-08).

### Item Row

The signature component. **Three states, not two** — and the third is the one
the app exists for:

- **Pending — an instruction.** Empty status circle. What to buy: quantity
  needed, desired brand, target shop, set in the written face, uppercase. No
  price: the app does not yet know what this will cost, and inventing an
  estimate would present a guess with the authority of a record.
- **In the cart — the trip happening.** The circle takes the cart glyph on
  `--tinta-0`. The row moves below the die-cut into the cart stub. **The
  progress bar advances here**, when the item goes in the cart — not when it
  is paid for. Names stay written (you wrote them, also on the stub); the
  stub's rubric and seal are printed, because from the cut down the sheet is a
  counterfoil.
- **Bought — a record.** Check on `--verde-0`. What happened: actual quantity
  or weight, the shop, what it actually cost, unit price beneath — printed in
  mono, uppercase, with the amount in the right-hand column in `--ink-1` (the
  Grayscale Ink Rule; only the tick is green).

**The die-cut.** The boundary between pending and cart is a perforation
(`.perf`), not a divider — it replaces the dashed section rule at that
boundary rather than adding material. The holes show `--void`: the board in
light, a hole deeper than any board in dark.

**The cart is torn off, not expired.** Crossing midnight, whatever is still
in the cart detaches along the die-cut and falls into the previous-purchase
area as a receipt with gaps — a real purchase missing data, not a reminder.
Nothing is asked of the user, and the date already says how old it is.

**No strikethrough — anywhere in the app.** It defaces the one field that did
_not_ change — the product's identity — while giving no acknowledgement to
the fields that did, and it makes re-buying feel like undoing something dead,
when re-buying is a primary function. The state is carried by the circle, the
sheet, the typeface and the amount column. `--ink-strike` and `.t-strike` were
deleted; do not reintroduce them.

### Paper Sheet

One sheet on a board, thinner receipts below. What tells them apart at a
glance — and carries the paper metaphor — is the **relief** (cast in light,
edge in dark — _The Same-Relief Rule_), the **rim light** on the receipt's cut
edge in light, the **veil** over a settled sheet, and the grammage those
imply. Those read one-handed in an aisle.

The crease — a static treatment for the live product and a full procedural
generator for marketing surfaces — is **out of scope of the 2026-08
redesign**; the apparatus and its analysis are kept on record in
[docs/design/crease-archive.md](docs/design/crease-archive.md), and its tokens
(`--paper-facet-*`, `--paper-relief-*`, `--paper-seed`, `--paper-amp`) still
ship, descoped rather than deleted.

### Bottom Sheets

Every bottom sheet builds on the shared `Sheet` primitive
(`frontend/src/components/Sheet.tsx`) — portal, scrim, grabber, dismissal,
focus trap, scroll lock and the open/close slide live there once. See
AGENTS.md for the behavioural contract.

## Do's and Don'ts

### Do:

- **Do** set type through `--font-*` variables and size it from the scale
  (`--fs-*`, or a `calc()` against `--written-scale`). A runtime appearance
  setting is planned; hard-coded faces and sizes would break it.
- **Do** use the semantic type classes (`.t-h2`, `.t-price`, `.t-caption`)
  when adding new UI. They are defined in `colorsAndType.css` and they are the
  intended hierarchy.
- **Do** reference canonical tokens: `--ink-1`, `--paper-0`, `--tinta-0`.
- **Do** give every figure **in the amount column** — and every EAN —
  `font-variant-numeric: tabular-nums` in JetBrains Mono. Inline quantities
  are exempt; see _The Tabular Numerals Rule_.
- **Do** match paired faces by measured cap height, not by px value.
- **Do** keep touch targets at `--hit-min` (44px) or larger; the design scene
  is one-handed use in a supermarket aisle.
- **Do** author dark-mode values by hand for every new colour — in the media
  query **and** in both `.theme-*` mirrors.
- **Do** measure a new ink against the surface it will sit on, in both lights
  (_The Surface-Relative Ink Rule_).
- **Do** add tracking whenever setting uppercase.
- **Do** keep the accent rare — it marks what is interactive, not what is
  present.

### Don't:

- **Don't** write a raw `font-size` in px in a component; sizes come from the
  scale.
- **Don't** use the compatibility aliases in `index.css` (`--text`,
  `--text-h`, `--bg2`, `--shadow`, `--sans`, `--heading`). They are marked for
  removal once components consume canonical tokens.
- **Don't** strike through purchased items — no strikethrough anywhere.
- **Don't** dim a row with `opacity`; secondary is said with ink and weight.
- **Don't** show a price on a pending item unless it is a real recorded
  figure, and then style it as a hint: the Data face at `--fs-12`, `--ink-2`,
  never bold, in the amount column, dashed while unconfirmed. Never italic —
  no family in this system loads an italic face, so `font-style: italic` is
  synthesized oblique, and on the written face that shears an already-slanted
  script into something that reads as broken.
- **Don't** round paper. Sheets are `--r-sheet`; a 14px corner turns paper
  into a card.
- **Don't** let the paper leave the list. Board, sheet, veil and handwriting
  belong to an open list; the rest of the app is flat surface in the same
  palette.
- **Don't** illustrate the paper metaphor. No torn edges, no photographic
  paper texture, no curled corners, no coffee stains. The material lives in
  the palette, the geometry and the light.
- **Don't** add a shadow between sections, rows, or cards inside a screen. The
  sheets-on-the-board relief is an exception for genuinely separate objects,
  not licence.
- **Don't** desaturate surfaces when applying the grayscale ink rule.
- **Don't** derive dark mode with `filter: invert()`, and don't take a dark
  shadow on trust — if you can't see it, it isn't there.
- **Don't** use `backdrop-filter`, parallax, or scroll-jacking; don't change
  colour on press.
- **Don't** build a glossy consumer look: gradient hero cards, large rounded
  blobs, confetti, celebratory animation on a checkmark. Buying milk is not an
  achievement; the confirmation is the record and the total.
- **Don't** build an enterprise dashboard: dense sortable grids, sidebar nav,
  KPI tiles. This is a phone in an aisle with one hand occupied.
- **Don't** style a store name as a brand. Store names are user-entered
  **data** and get no brand colour, no logo, no chrome of their own —
  PRODUCT.md forbids implied supermarket endorsement and this is its visual
  counterpart.

---

A rule 21 ("the board may leave the list as colour, never as material") was
proposed and withdrawn; it and the redesign's decided-against list (aisle
mode, the floating close-trip pill, a shared board, the board outside the
list, ticket stitching) are on record in the design handoff (claude.ai design
project `dfaf3276`), not restated here.
