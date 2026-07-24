---
name: CarroQueSí
description: A shared shopping list that becomes a receipt as you shop
colors:
  paper-0: "#eef1f5"
  paper-1: "#e3e7ed"
  paper-2: "#d5dae2"
  paper-edge: "#b4bac4"
  paper-line: "#c7d2e1"
  table: "#c2a982"
  table-edge: "#a08a6a"
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
    fontSize: "26px"
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
  hand:
    fontFamily: "Patrick Hand SC, Bradley Hand, cursive"
    fontSize: "18.9px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.045em"
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
    height: "48px"
---

# Design System: CarroQueSí

> **This file is the system.** It describes CarroQueSí's visual world as decided,
> and every token it names exists in `frontend/src/colorsAndType.css` — build
> against it directly.
>
> The **sheet model** (two sheets of different stock, instruction-vs-outcome rows,
> no rules inside a sheet, no strikethrough) is designed and tokenised but not yet
> assembled in components. That is an implementation backlog, not an ambiguity
> here: where this file and the current UI disagree, **this file wins** and the UI
> is what needs to change. Items still to be built are listed in
> *Implementation status* at the end.

## Overview

**Creative North Star: "El Ticket"**

*El ticket* is what a receipt is called in Spain, and it is the whole idea. This
is not a shopping-list app that happens to store prices; it is a list that
**becomes a receipt as you shop**. Before the shop, a line is an instruction —
six of these, that brand, that shop. After the shop, the same line is a record —
what was actually bought, what it actually cost. Two different documents, so two
different sheets of paper, in two different hands.

That resolves what the interface is made of. You **write** the list; the till
**prints** the receipt. So the list is set in a handwriting face in block
capitals, and the receipt in monospace, also in capitals — the same case arrived
at from two unrelated causes, which is exactly why the two can share it without
the distinction collapsing. Both sheets carry their titles in the app's serif,
because on real stock the header is pre-printed before anything is written on it.

The palette is cool blue-grey paper and near-black ink, on a warm wooden table.
On either sheet, ink is **grayscale**: the two hands already carry the state, so
colour has nothing left to do there. The world is deliberately physical —
procedurally creased paper, cast shadows, a rim-lit cut edge — but never
illustrated. There is no drawn torn edge, no paper photograph, no curled corner.
The material lives in the palette, the geometry and the light.

**Key Characteristics:**

- Two sheets of different grammage, lying at the same level on a table
- Zero rules inside a sheet; whitespace and an aligned numeric column separate
- Handwriting for intent, monospace for record, serif for pre-printed
- Grayscale ink on both sheets; the table is the only warm thing in frame
- Flat by default — depth is for objects that are genuinely separate
- Amounts sit in one right-aligned tabular column in both states; only their
  truth-value changes

## Colors

Cool paper, cool ink, one warm surface underneath. Hue is spent almost nowhere.

### Primary

- **BIC Pen Blue** (`#1a3fa0`): the app's one brand accent — links, focus rings,
  primary buttons, active filter chips, the default-list star. Named `tinta`
  after the ballpoint it came from. In dark it lifts to `#91a8ff`, because the
  light value fails contrast on a near-black ground.

### Secondary

- **Wooden Table** (`#c2a982`): the surface the sheets lie on. It is visible
  *only* in the seam between them and never behind content. In dark it deepens to
  `#3b2f22`. This is the only warm colour in the product and the only one that
  survives the grayscale rule below.

### Tertiary

Semantic only, never decorative:

- **Grocer Green** (`#2f7a4a`): a purchase confirmed, a price recorded, a toast.
- **Red Pen** (`#c0392b`): destructive actions, errors, corrections.
- **Highlighter** (`#c9941f`): attention, promotion, due-again.

### Neutral

- **Composition Paper** (`#eef1f5`): the page and the sheet face.
- **Recessed Paper** (`#e3e7ed`): inputs, list beds, the sunken state.
- **Hover Paper** (`#d5dae2`): pointer feedback only.
- **Paper Edge** (`#b4bac4`): borders and dividers outside a sheet.
- **Pencil Black** (`#15161b`) → **Secondary** (`#353742`) → **Muted**
  (`#6a6d7a`) → **Non-text** (`#94969f`): the ink ramp. The fourth step is named
  for what it may *not* do — see *The Measured Ink Rule*. Only the first three
  carry text.

### Named Rules

**The Grayscale Ink Rule.** Inside a sheet, ink is achromatic: `tinta` and
`verde` both resolve to `--ink-1`. They become indistinguishable there, and
that is the point — the typography already encodes who wrote each line, so
colour would repeat a signal that is carried better, and a hue that means
nothing is worse than no hue. Dark mode follows for free, since `--ink-1`
re-themes with the rest of the ramp.

This governs **content**, not controls. The purchase tick keeps `--verde-0`:
it is an affordance reporting its own state, not ink on paper. Everything the
household wrote or the shop printed — names, quantities, brands, shops, prices,
totals — is ink. Outside a sheet — buttons, sheets, errors, toasts — the
palette applies in full.

**The Surfaces-Keep-Their-Colour Rule.** Grayscale is a rule about *content*, not
about the world. The table stays wooden and the paper stays cool-blue under it.
Desaturating the surface as well produces a monochrome mockup, not a photograph.

**The Dark Is A Re-Theme Rule.** Dark mode is authored, not inverted — a
late-night desk: graphite paper, cream ink, accents lifted rather than flipped.
It is delivered by `@media (prefers-color-scheme: dark)` plus `.theme-light` /
`.theme-dark` overrides, with `ThemeManager` mirroring the OS preference onto
`<body>`. Every colour above has a hand-picked dark counterpart in
`colorsAndType.css`; never derive one with `filter: invert()`.

**The Measured Ink Rule.** The ink ramp is contrast-tested against
`--paper-0`, not assumed, and only the top three steps carry text. Measured
against WCAG's 4.5:1 floor:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink-0` | 15.95 | 15.86 | Item names, headings |
| `--ink-1` | 10.43 | 11.00 | Body, amounts, secondary |
| `--ink-2` | 4.54 | 5.84 | Meta text — clears the floor by 0.04 in light; do not darken the paper beneath it |
| `--ink-3` | **2.60** | **3.55** | **Below AA in both themes. Never live text** |

Anything a person is meant to read stops at `--ink-2`. `--ink-3` has exactly two
consumers today, both `::placeholder` (`CreateListCard.css`, `SmartInputBar.css`),
and **both fail SC 1.4.3**. This is not a grey area — the Understanding document
for 1.4.3 addresses it by name: *"This success criterion applies to text in the
page, including placeholder text… the text needs to provide sufficient
contrast."* The incidental exception covers inactive components, pure decoration
and invisible text; a placeholder is none of those.

The fix is constrained in a way worth knowing before attempting it. Holding
`--ink-3`'s hue, the lightest value that reaches 4.5:1 is `#6c6d74` in light and
`#7a7e87` in dark — the first is `--ink-2` to within a shade. **There is no
compliant fourth text step in this ramp.** So the resolution is not a new colour:
either placeholders take `--ink-2`, or the design stops asking placeholder text
to carry information a person needs.

Two consequences follow. `--ink-2` is a hard floor, not a starting point — the
0.04 of headroom means any future darkening of `--paper-0`, or any lightening
of `--ink-2`, drops meta text below AA with nothing to catch it. And moving the
purchased amount from `--verde-0` to `--ink-1` under the Grayscale Ink Rule
raised it from 4.63 to 10.43; the grayscale decision is an accessibility gain,
not a cost.

## Typography

**Display Font:** Bree Serif (with Georgia, serif)
**Body Font:** Geist (with system-ui)
**Hand Font:** Patrick Hand SC (`--font-written`, with Bradley Hand, cursive) —
**Data Font:** JetBrains Mono (with SF Mono, Consolas)

**Character:** Four voices, each with a reason to exist. Bree Serif is the
pre-printed stationery. Geist is the application talking. Patrick Hand SC is the
household writing a list. JetBrains Mono is a machine printing a total. A fifth
voice would have to justify itself against those four.

### Hierarchy

- **Display** (400, 56px, 1.15): sign-in and waitlist screens only.
- **Headline** (400, 26px, 1.15): screen titles in the list header and dashboard.
- **Title** (600, 24px, 1.3): section titles inside sheets.
- **Body** (400, 16px, 1.5): the default. 15px is the floor for **content** text —
  anything a person reads to decide something. Labels, meta lines and secondary
  figures go smaller by design and are governed by contrast instead (see *The
  Measured Ink Rule*); the floor is not a blanket minimum.
- **Label** (600, 12px, 0.1em, uppercase): eyebrows and section headers.
- **Hand** (700, `calc(21px * var(--written-scale))`, 0.045em, uppercase):
  unpurchased item names.
- **Data** (600, 17.5px, 0.02em, uppercase, tabular): purchased item names, all
  prices, EANs, totals.

### Named Rules

**The Cap-Height Rule.** Faces are matched by measured **cap height**, never by
px value. Patrick Hand SC at 18.9px measures a 13.03px cap; JetBrains Mono only
reaches that at **17.5px**. Setting both to the same number leaves the receipt a
third too small. Any new face pairing is calibrated the same way, with a
per-face optical scale factor rather than a shared size.

**The Tabular Numerals Rule.** Every figure in the **amount column** — price,
unit price, total — plus every EAN is `font-variant-numeric: tabular-nums` in
JetBrains Mono. Amounts must stay aligned across rows; proportional digits break
the column and the column is the point.

The exception is the quantity on an unpurchased line. It sits inline in the meta
row, not in the column, and it is something the household *wrote* — so it takes
the hand face with the rest of that line. Alignment is not a property an inline
figure has, so there is nothing for tabular numerals to buy there.

**The Uppercase Tracking Rule.** All caps costs the word-shape cue people scan
by, so tracking is always added back. Never set caps at default tracking. How
much depends on the face as much as the size — the hand is tracked wider than
the mono despite setting larger — so each role carries its own figure in its
frontmatter entry and this rule names none of them. The single exception is
hand meta text, which has no role of its own and takes `0.05em`. Negative
tracking belongs to large lowercase type only, again at whatever value that
role's entry carries, and never appears on caps: a negative value on an
uppercase role is always a sign error, not a choice.

**The Provisional Face Rule.** The hand face is not settled and an appearance
section in settings is planned, so no face is hard-coded in a component. Type
always resolves through `--font-written`, `--font-mono`, `--font-display`,
`--font-sans` or `--font-hand`, and hand sizes derive from `--written-scale` —
so a face can be swapped at runtime without touching a stylesheet. Note
`--font-hand` (Caveat) and `--font-written` (Patrick Hand SC) are **different
roles**: the first is a brand voice used on the wordmark and encouraging asides,
the second is content typography that must survive an aisle at meta size.

## Layout

Mobile-first and single-column; the app is designed for one hand in a supermarket
aisle, not a desktop. `#root` caps at 1126px and is centred with hairline side
borders, so a wide window reads as a phone on a page rather than a stretched app.

Spacing follows a 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96. Rows are 9px
vertical by 14px horizontal; sheet interiors carry no side padding of their own
because the paper bleeds to its own edges.

Touch targets are floor-tested, not assumed: `--hit-min: 44px` (the WCAG/iOS
minimum), `--hit-tap: 48px` for primary affordances, `--hit-sheet: 56px` for
sheet rows and large CTAs. The list header is 56px and sticky; the Smart Input
bar is fixed to the bottom; bottom sheets and toasts respect
`env(safe-area-inset-bottom)`.

### Named Rules

**The Aisle Wins The Tie Rule.** When the composing-at-home moment and the
in-store moment want different layouts, design for the store. It is the harder
scene and the one the product exists for.

## Elevation & Depth

**Flat by default.** Surfaces sit flat and separate with a 1px hairline or a
change of paper tone. A shadow means an object has physically left the page.

### Shadow Vocabulary

- **`--shadow-sm`** (`0 1px 1px rgb(30 35 55 / 10%), 0 2px 4px -2px rgb(30 35 55 / 14%)`):
  a card lifted off the stack; suggestion popovers.
- **`--shadow-md`** (`0 1px 2px rgb(30 35 55 / 12%), 0 6px 14px -4px rgb(30 35 55 / 18%)`):
  dropdown and avatar menus.
- **`--shadow-lg`** (`0 2px 4px rgb(30 35 55 / 14%), 0 16px 32px -8px rgb(30 35 55 / 24%)`):
  toasts and a card being dragged.
- **`--shadow-sheet`** (`0 -2px 4px rgb(30 35 55 / 10%), 0 -16px 40px -6px rgb(30 35 55 / 22%)`):
  bottom sheets — note it casts **upward**.

All four are two-layer (a tight contact shadow plus a soft ambient one) and
tinted cool blue-grey so they read against cool paper instead of smudging over
it. Dark mode uses pure-black equivalents at higher opacity.

### Named Rules

**The Ruled-Not-Raised Rule.** Separation inside a screen is a hairline or a tone
change, never a shadow. Shadows are reserved for: bottom sheet, dropdown menu,
toast, dragging card, and the two sheets below.

**The Two Sheets Exception.** The list and the receipt are genuinely
separate physical objects, so each casts a real shadow — onto the **table**, not
onto each other. They lie at the same elevation, side by side. The thicker list
stock casts slightly deeper (`0 1px 1.5px`, `0 4px 9px -4px`) than the thin till
roll (`0 1px 1px`, `0 2px 5px -3px`), and the receipt carries a **1.5px** rim
light on its cut edge to suggest thickness — `--lip` over the first pixel,
`--lip-soft` over the remaining half, then nothing. Both are per-theme and much
weaker in dark, where a bright lip on graphite reads as a glowing seam rather
than a cut edge; take the values from the tokens, never from here. The falloff
is the point: a flat band
reads as a drawn line rather than a lit edge, and thin stock cannot support a
thick highlight. Do not round this to 2px to match `--r-sheet`; the rim and the
sheet radius are unrelated geometry that happen to sit near the same number.
This is the **only** sanctioned in-page shadow and it does not generalise to
cards, rows, or sections.

## Shapes

Two radius languages, and which one applies says what a thing is.

**Interface** is gently rounded: `4px` tags, `6px` small buttons, `10px` inputs
and menus, `14px` cards and the Smart Input bar, `20px` large surfaces, `999px`
filter chips. Bottom sheets round their top corners only (`16px 16px 0 0`),
because they arrive from below.

**Paper** is cut, not rounded: sheets use `2px`, near-square. Paper does not have
a border radius; a sheet with a 14px corner reads as a card, and the whole
distinction collapses.

Borders are hairlines (1px), or 1.5–2px where a control must feel grabbable — the
Smart Input row, the item checkbox, a focused field. Dashed borders mark
something not yet real: an empty tag slot, a "buy again" affordance, and the
pre-printed rule under a sheet title.

### Named Rules

**The Cut-Edge Rule.** Anything representing paper gets the sheet radius
(`--r-sheet`, `rounded.sheet`). Anything representing interface gets the
interface scale. Never mix them on one element.

## Components

There is **no shared button class** in this codebase; every component builds its
controls from tokens directly. That is a real property of the system, not an
oversight to be tidied away silently — but it means the rules below are the
contract, since no stylesheet enforces them.

### Buttons

- **Shape:** gently rounded (`10px`), pill for filter chips (`999px`).
- **Primary:** `--accent` ground, `--accent-fg` text, 600 weight, min 44px tall.
- **Hover / Focus:** background shifts to `--accent-hover`; focus shows
  `--focus-ring` (`0 0 0 3px` of the accent at 30%). No lift, no glow.
- **Quiet:** transparent ground, `--border` hairline, `--ink-0` text.
- **Destructive:** `--danger` text on transparent, or `--danger` ground when the
  action is the sheet's primary confirm.
- **Disabled:** `--border` ground or 40–50% opacity, plus `cursor: not-allowed`.

### Chips

- **Filter chip:** `--paper-1` ground, `--border` hairline, pill, 13px.
- **Selected:** `--tinta-0` ground, `--accent-fg` text, border matches ground.
- **Tag chip:** `--paper-1`, 5px radius, 11.5px — a data label, not a control.
- **Dashed chip:** a slot that is empty or an action not yet taken.

### Cards / Containers

- **Corner:** `14px` for list cards; `2px` for paper sheets.
- **Background:** `--paper-0`; `--paper-1` when recessed.
- **Shadow:** `--shadow-sm` at rest, `--shadow-lg` while dragging.
- **Border:** 1px `--border`.
- **Padding:** 16px, 20px on the leading edge where a checkbox sits.

### Inputs / Fields

- **Style:** `--paper-1` ground, 1.5px `--border`, `14px` radius.
- **Focus:** border becomes `--accent`; the ring is on the wrapper, not the input,
  so the whole control reads as focused.
- **Placeholder:** `--ink-2`. Not `--ink-3` — see *The Measured Ink Rule*; the
  shipped components still use `--ink-3` and that is recorded as a defect.
- **Error:** `--danger` text beneath, never colour alone.

### Navigation

The list header is 56px, sticky, `--paper-0`, with a 1px bottom hairline. Back is
an accent-coloured text button on the left; the title is Bree Serif 26px,
absolutely centred and truncated at 62% width; the menu is a 32px hamburger on
the right.

### Item Row

The signature component. Two states that are two different kinds of information.

**Unpurchased — an instruction.** What to buy: quantity needed, desired brand,
target shop. Set in the hand face, uppercase. No price: the app does not yet know
what this will cost, and inventing an estimate would present a guess with the
authority of a record.

**Purchased — a record.** What happened: actual quantity or weight, the shop it
came from, what it actually cost, unit price beneath. Set in monospace,
uppercase, with the amount in `--ink-1` in the right-hand column — it is
printed matter, so the Grayscale Ink Rule applies; only the tick is green.

**No strikethrough.** It defaces the one field that did *not* change — the
product's identity — while giving no acknowledgement to the fields that did. It
also makes re-buying feel like undoing something dead, when re-buying is a
primary function. The state is carried by the sheet, the tick, the typeface and
the amount column.

### Paper Sheet

Two sheets, procedurally creased, on a table.

- **Geometry:** Delaunay triangulation over a jittered grid (jitter 0.66),
  flat-shaded per facet. Per-vertex height from 2-octave value noise; the facet
  normal is lit by one distant lamp at `[-0.45, -0.72, 0.53]`.
- **Grammage carries state.** List stock ≈80 g/m²: 80px facets, relief 0.55.
  Receipt stock ≈50 g/m²: 16px facets, relief 0.80. Lower grammage creases finer
  *and* harder, so relief scales with facet pitch rather than staying fixed.
- **Amplitude** is an absolute RGB delta, ±10 in light and ±20 in dark — not a
  multiplier, because multiplying a near-black paper yields no usable range.
- **Veil:** the purchased sheet is darkened by a `multiply` layer of
  `rgb(230,230,230)` (90% brightness), covering the sheet **including its
  header**. Multiply scales the crease instead of replacing it, so contrast
  survives — and multiply is what a cast shadow physically is.
- **Scope:** one canvas per sheet, never per row. Deterministic from a seed
  (currently `62`), so a sheet is reproducible from parameters, not an asset.
- **The receipt tiles; the list does not.** This is the one place the paper
  metaphor collides with the product, and the two sheets resolve it
  differently because they sit at opposite ends of every relevant axis.

  The receipt's 16px facets are five times finer than the list's 80px, and the
  receipt is the sheet that *grows* — every purchase lengthens it. Keyed to
  sheet height at a 380px phone width, its vertex count runs ~1,400 at 20
  items, ~4,300 at 60 and **~14,400 at 200**. So the receipt's crease is a
  **seamless tile, generated once from the seed and repeated**: 512px square,
  1,024 vertices, paid once no matter how long the shop runs. Seamlessness is
  a real constraint on the generator, not a filter applied afterwards — the
  jittered grid must wrap toroidally with ghost points across each edge, and
  the value noise must be periodic at the tile size. 512 ÷ 16 = 32 cells
  exactly, so the lattice divides cleanly; keep that true if either number
  moves. The **lighting needs no separate wrap**: the lamp is one fixed
  direction (`[-0.45, -0.72, 0.53]`), a global constant, so a facet's tone is a
  pure function of its normal and nothing in the pipeline reads absolute canvas
  position. Wrapping the grid and the noise therefore wraps the shading for
  free — but that only holds while it stays true, so anything position-keyed
  (a vignette, ambient occlusion, a gradient overlay) would break the seam and
  must not be added to the canvas.

  The list stays fully procedural. At 500 items it is 1,248 vertices — it
  never had the problem, it is the sheet a long fold reads across, and it
  carries no veil, so tile repetition would show there first.

  Two things this deliberately does **not** do. It does not key generation to
  sheet height: that puts the worst frame on the tap marking an item
  purchased, one-handed, in an aisle, and degrades as the shop goes *better* —
  the scene *The Aisle Wins The Tie Rule* names as the one to design for. And
  it does not window generation to the viewport, which only moves the same
  cost from the tap onto scroll.

  The tile is generated at runtime from seed `62`, not shipped as an image, so
  the sheet remains reproducible from parameters.

  **Both sheets must share one height function and one noise function.** Tiling
  the receipt and not the list means two generation paths off the same
  parameters, and an algorithmic divergence between them — a third octave added
  on one side, a different relief curve — would not show up as a diff anyone
  can eyeball. They are the same paper in different stock; the only thing that
  may differ between the paths is periodicity.

  **Repetition, not contrast, is the risk — and amplitude does not answer it.**
  Amplitude is an absolute ±10 RGB delta in light (7.8% of range peak-to-peak)
  and ±20 in dark (15.7%), and the receipt's multiply veil damps it a further
  10%. That settles whether a *single* facet's shading is perceptible. It says
  nothing about whether a *repeat* is, and those are separate thresholds: the
  eye is far more sensitive to periodic recurrence than to isolated local
  contrast, and one fixed-direction lamp means every tile catches its highlight
  in the same relative place, which under scroll reads as a beat.

  A bigger tile does not fix this; it repeats less often, exactly. And 512px is
  **smaller** than the visible sheet area on every target device — 531px on the
  narrowest, 779px on a Pixel 10 — so between 1.0 and 1.5 whole periods are on
  screen at once and the repeat is available to the eye in a single glance,
  before any scrolling. The fix is to break *exact* repetition while keeping
  O(1) cost: derive **2–4 seed-offset variants** at init and alternate them, so
  no two adjacent tiles are bit-identical.

  Periodicity under scroll is **unverified** — no tile has been generated. Do
  not read the amplitude figures as settling it.

  Note the `feDisplacementMap` rejection below was reasoned the same way and
  got the per-frame cost right, while this one-off cost went unsized on the
  finer-faceted sheet. The discipline was applied to the smaller risk.

## Do's and Don'ts

### Do:

- **Do** set type through `--font-*` variables and size it from the scale
  (`--fs-*`, or a `calc()` against a per-face optical factor). A runtime
  appearance setting is planned; hard-coded faces and sizes would break it.
- **Do** use the semantic type classes (`.t-h2`, `.t-price`, `.t-caption`) when
  adding new UI. They are defined in `colorsAndType.css`, they ship today, and
  they are the intended hierarchy.
- **Do** reference canonical tokens: `--ink-1`, `--paper-0`, `--tinta-0`.
- **Do** give every figure **in the amount column** — and every EAN —
  `font-variant-numeric: tabular-nums` in JetBrains Mono. Inline quantities on
  either sheet are exempt; see *The Tabular Numerals Rule*.
- **Do** match paired faces by measured cap height, not by px value.
- **Do** keep touch targets at `--hit-min` (44px) or larger; the design scene is
  one-handed use in a supermarket aisle.
- **Do** author dark-mode values by hand for every new colour.
- **Do** add tracking whenever setting uppercase.
- **Do** keep the accent rare — it marks what is interactive, not what is present.

### Don't:

- **Don't** write a raw `font-size` in px in a component. Roughly half of all
  `font-size` declarations still are; that half is debt, not precedent.
- **Don't** use the compatibility aliases in `index.css` (`--text`, `--text-h`,
  `--bg2`, `--shadow`, `--sans`, `--heading`). They are explicitly marked for
  removal once components consume canonical tokens.
- **Don't** put a rule between rows inside a sheet. Real receipts separate with
  whitespace; a hairline per row cuts the crease into strips. The only line inside a sheet is the dashed rule under a pre-printed title.
- **Don't** strike through purchased items.
- **Don't** show a price on an unpurchased item unless it is a real recorded
  figure, and then style it as a hint: the **Data** face at `--fs-12`, `--ink-2`,
  never bold, in the amount column. It is a recorded figure, so it is printed
  matter and takes the mono face and tabular numerals like every other figure in
  that column. What separates it from a receipt actual is the sheet it is on, its
  size, and its lighter ink — **not** slant. No family in this system loads an
  italic face, so `font-style: italic` is synthesized oblique; on the hand face
  that shears an already-slanted script into something that reads as broken.
  Never use italic to carry meaning here.
- **Don't** round paper. Sheets are `2px`; a 14px corner turns paper into a card.
- **Don't** illustrate the paper metaphor. No torn edges, no photographic paper
  texture, no curled corners, no coffee stains. The material lives in the
  palette, the geometry and the light — procedurally, never as an image.
- **Don't** add a shadow between sections, rows, or cards inside a screen. The
  two-sheet shadow is an exception for genuinely separate objects, not licence.
- **Don't** desaturate surfaces when applying the grayscale ink rule.
- **Don't** derive dark mode with `filter: invert()`.
- **Don't** build a glossy consumer look: gradient hero cards, large rounded
  blobs, confetti, celebratory animation on a checkmark. Buying milk is not an
  achievement; the confirmation is the record and the total.
- **Don't** build an enterprise dashboard: dense sortable grids, sidebar nav, KPI
  tiles. This is a phone in an aisle with one hand occupied.
- **Don't** style a store name as a brand. Store names are user-entered **data**
  and get no brand colour, no logo, no chrome of their own — PRODUCT.md forbids
  implied supermarket endorsement and this is its visual counterpart.
- **Don't** ship `feDisplacementMap` text warping on the live list. It is
  implemented and it works, but the filter re-evaluates on every paint, and the
  list scrolls, polls and animates. Generation is one-off; the filter cost is
  per-frame forever.

## Implementation status

Everything above is decided and tokenised. These pieces are **designed but not
yet assembled in components** — the gap is a backlog, not a licence to deviate.

| Piece | State | Where the values live |
|---|---|---|
| Palette, type scale, radii, shadows, font stacks | **Shipping** — consumed throughout | `colorsAndType.css` |
| Spacing and motion tokens | Defined — **0 consumers**; components hardcode the same values as literals | `colorsAndType.css` |
| Hit-target tokens | Partial — `--hit-min` used 4× in 2 files; `--hit-tap`, `--hit-sheet` unused, their values written as literals | `colorsAndType.css` |
| Table, cast/rim, crease geometry, `--font-written` tokens | **Shipping** (added with this file, unused so far) | `colorsAndType.css` |
| Two sheets with per-grammage crease, veil, rim light | To build | `.impeccable/design.json` → `extensions.paper` |
| Seamless-tiled receipt crease, procedural list crease | To build — **unmeasured**; the 200-item figures are arithmetic, not observation, and no tile has been generated | `extensions.paper.tiling` |
| Tile periodicity under scroll | **Unverified risk** — amplitude does not settle it; needs 2–4 seed-offset variants and a look on a real device | `extensions.paper.tiling.risk` |
| Instruction vs. outcome row anatomy | To build | *Components → Item Row* |
| Removal of the strikethrough on purchased items | To build | *Do's and Don'ts* |
| Pre-printed serif sheet titles | To build | *Components → Pre-printed Sheet Title* |
| Grayscale ink on both sheets | To build | *Colors → The Grayscale Ink Rule* |
| Smart Input add/scan buttons at `--hit-min` | To build — currently 36px | `SmartInputBar.css` |
| Placeholder contrast (WCAG 1.4.3) | **To fix — live failure**, `--ink-3` at 2.60 / 3.55 | `CreateListCard.css`, `SmartInputBar.css` |
| Component sample sizes mapped to the `--fs-*` scale | To build — samples carry tuned raw values (11px, 12.5px, 13.5px) with no scale step | `.impeccable/design.json` → `components` |
| Semantic type classes (`.t-*`) adopted by components | To build — 13 defined, 0 used | `colorsAndType.css` |
| Legacy alias removal | Partial — `--text` (5, in `ItemCard.css`/`ItemList.css`) and `--text-h` (3, in `ItemCard.css` plus `index.css`'s own `h1, h2` and `code` base rules, so it styles headings app-wide) are still live; `--bg2`, `--shadow`, `--sans`, `--heading` are already dead and can be deleted today | `index.css` |

Two consequences worth stating plainly:

- **Removing the strikethrough will break the committed Playwright visual
  baselines** (`item-purchased-*`, `purchase-lifecycle-*`). Regenerate with
  `just frontend update-snapshots`, which runs Docker to match CI's Linux font
  rendering — do not regenerate them locally on macOS.
- **The reference implementation of the sheet model is not in this repository.**
  It was built and tuned as an interactive prototype; the parameters it produced
  are recorded in `.impeccable/design.json` under `extensions.paper`, which is
  sufficient to rebuild it without the prototype.
