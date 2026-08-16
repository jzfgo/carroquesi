# The crease — static and procedural (archive)

> **Out of scope of the 2026-08 redesign; kept on record, not the plan.**
> The redesign carries the paper metaphor with the cast shadows, the veil, the
> rim light and the dark edges — see [DESIGN.md](../../DESIGN.md) → _Elevation &
> Depth_. The crease apparatus below is descoped, not deleted: the analysis was
> hard-won and this file exists so it is revisited deliberately, never
> reconstructed from scratch or silently inherited.

## What still exists in the codebase

The crease tokens ship in `frontend/src/colorsAndType.css` and the tuned
parameters live in `.impeccable/design.json` under `extensions.paper`:

- `--paper-facet-list: 80px`, `--paper-facet-receipt: 16px`
- `--paper-relief-list: 0.55`, `--paper-relief-receipt: 0.8`
- `--paper-seed: 62`
- `--paper-amp: 10` (light) / `20` (dark)

They have no consumers. Leave them until a decision either revives the crease
or deletes the tokens with it.

The reference implementation was an interactive prototype that is **not in this
repository**; the parameters it produced are recorded in
`.impeccable/design.json` under `extensions.paper`, which is sufficient to
rebuild it without the prototype.

## The split, as designed

What tells the two sheets apart at a glance — and carries the paper metaphor —
was **not** the crease. It is the cast shadow (the list casts deeper, the
receipt shallower), the rim light on the receipt's cut edge, the veil over a
purchased sheet, and the grammage those shadows imply. Those read one-handed in
an aisle. A triangulated micro-crease, tuned near the visibility floor, does
not. So the crease split by surface:

**Live product — a single static crease.** Every sheet gets one subtle,
pre-composed crease treatment: identical whether the receipt holds five items
or five hundred, cheap to paint, with no per-list state, no growth, no
scroll-repeat, and no vertex budget. The list-vs-receipt weight difference is
carried by the cast shadows and the veil, not by facet density.

**Marketing and onboarding — the full procedural crease.** The "El Ticket"
identity is _looked at_ on store screenshots, first-open and an about screen —
static, well-lit, zoomed, not mid-scroll, not one-handed. There the procedural
system earns its keep, and every problem that made it costly in the live
product (scroll periodicity, a receipt that grows to thousands of vertices, the
worst frame landing on the purchase tap) simply does not arise, because there
is no scroll, no growing list and no tap. It renders one well-composed sheet,
once, at full quality.

## The procedural spec

- **Geometry:** Delaunay triangulation over a jittered grid (jitter `0.66`),
  flat-shaded per facet. Per-vertex height from 2-octave value noise; the facet
  normal is lit by one distant lamp at `[-0.45, -0.72, 0.53]`.
- **Grammage carries state.** List stock ≈80 g/m²: 80px facets, relief `0.55`.
  Receipt stock ≈50 g/m²: 16px facets, relief `0.80`. Lower grammage creases
  finer _and_ harder, so relief scales with facet pitch rather than staying
  fixed.
- **Amplitude** is an absolute RGB delta, ±10 in light and ±20 in dark — not a
  multiplier, because multiplying a near-black paper yields no usable range.
- **Veil interaction:** the purchased sheet is darkened by a `multiply` layer
  of `rgb(230,230,230)` (90% brightness), covering the sheet **including its
  header**. Multiply scales the crease instead of replacing it, so contrast
  survives — and multiply is what a cast shadow physically is. (The veil itself
  is live spec; what is archived here is its interaction with the crease.)
- **Deterministic from a seed** (currently `62`), so the sheet is reproducible
  from parameters, rendered at runtime rather than shipped as an image.

## Why the split

Recorded so it is revisited deliberately, not silently inherited:

- The crease's payoff is mostly non-conscious: amplitude was tuned near the
  visibility floor _on purpose_, so a shopper glancing at a phone reads
  "slightly less flat than a fill," not "paper." The metaphor's legible
  carriers are elsewhere and don't need it.
- Its cost concentrated on the one interaction the Aisle-Wins-The-Tie rule
  commits to protecting: a procedural crease keyed to a growing receipt lands
  its heaviest frame on the one-handed purchase tap.
- It spends contrast margin. `--ink-2` already runs at 4.54:1, `0.04` above the
  AA floor; a varying facet field under text at that edge is a bad trade for a
  shopper in inconsistent aisle light.
- Nothing was built, so the split cost nothing to make.

## Tiling math, if it ever returns to the live list

If the procedural crease is ever wanted in the live, scrolling list, it must
solve what the static version sidesteps. The receipt grows, so keying
triangulation to sheet height runs ~14,400 vertices at 200 items; the fix is a
seed-generated **512px seamless tile** (1,024 verts, O(1) in item count),
wrapped toroidally with noise periodic at the tile size (512 ÷ 16 = 32 cells),
driven by the **same height and noise function as the list** so the two paths
cannot diverge unseen. Even then a fixed-lamp tile _repeats visibly_ — one
period more than fills the viewport (iPhone 17 681px, Pixel 10 732px, both
above the 512px tile), and amplitude settles single-facet visibility, not
periodicity — so it needs **2–4 seed-offset variants** alternated. Do not read
the amplitude figures as settling periodicity; that is unverified, and no tile
has been generated.

## Related: `feDisplacementMap` text warping

Implemented and working, and rejected for the live list for the same
cost-shape: the filter re-evaluates on every paint, and the list scrolls,
polls and animates. Generation is one-off; the filter cost is per-frame
forever. If paper-textured type is ever wanted, it belongs on the same static,
looked-at surfaces as the procedural crease.
