# Claude Design handoff — canonical for the redesign

This directory holds the approved design handoff exported from Claude Design
(claude.ai/design), project **«Design system polish and simplification»**,
exported 2026-08-03 (frames) / 2026-08-06 (bundle refresh).

**This handoff is the canonical visual reference for the 2026-08 redesign.**
[DESIGN.md](../../../DESIGN.md) is a summary derived from it — when the two
disagree, the frames here win.

## Contents

- `CarroQueSí - Handoff (aprobados).dc.html` — **the entry point.** Only the
  approved frames, grouped by area, with archive links into the full project
  file. Frame ids (13a, 21b, 30a, …) are the ones AGENTS.md and tickets cite.
- `CarroQueSí - UI Polish.dc.html` — the full working project the approved
  frames link into (earlier iterations, archived options).
- `github.md` — screen → code map and sync log from the design sessions.
- `_ds/` — the design-system bundle (tokens, `colors_and_type.css`) the frames
  import.
- `assets/`, `frontend/src/assets/` — images the frames reference (paths are
  load-bearing; don't move them).
- `support.js` — the export's viewer script.
- `BUNDLE-README.md` — the exporter's own README, kept as shipped.

## Provenance and pruning

Committed as static files, verbatim from the export, except:

- macOS junk removed (`.DS_Store`, AppleDouble files, `.thumbnail`) and
  NFD-normalized duplicate filenames dropped (byte-identical to the NFC ones
  kept).
- `design_handoff_carroquesi_ui/` (an older, superseded export of the same
  project) and `uploads/` (unreferenced sketches) were not committed.

The frames are prototypes, not production code: read the HTML/CSS as spec and
match the visual output. Viewing them in a browser needs network access
(Google Fonts, lucide from unpkg).
