# JAV-257 — scan a barcode onto a line from the item sheet (approved 2026-11-20)

Approved frames for adding or correcting a line's barcode from the item sheet
(22a), filling empty fields from Open Food Facts, and offering the catalogue's
value as a suggestion when a field already has one. Designed as a canvas
(«Escanear código desde la ficha · JAV-257») and copied here verbatim.
Implementation: JAV-257.

Like the rest of this handoff, the frames are spec, not production code: read
the HTML/CSS and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime does
not load here. Open them as plain HTML or read the source. Shared classes are
in `cqs.css`. A dashed accent outline marks UI that does not exist yet.

## Frames

| File                  | What it shows                                                                 |
| --------------------- | ----------------------------------------------------------------------------- |
| `Main.dc.html`        | 1 · Item sheet: «Sin código», row edits by hand, `ScanBarcode` button scans   |
| `Escaner.dc.html`     | 2 · Scanner opened from the sheet, «Código para · <name>»                     |
| `Rellenada.dc.html`   | 3 · After the scan: code, brand and format filled; toast says what was filled |
| `Nombre.dc.html`      | 4 · Catalogue disagrees on «Nombre»: bulb + tooltip open (✕ / ✓ discs)        |
| `Plegado.dc.html`     | 4b · Tooltips folded: a bulb per field, ripple on a bulb that just appeared   |
| `Deshacer.dc.html`    | 4c · Suggestion applied: bulb turns into undo, tooltip shows «Antes»          |
| `Reemplazar.dc.html`  | 5 · The line already had another code: confirm before replacing               |
| `Desconocido.dc.html` | 6 · Code unknown to the catalogue: stored anyway, toast says so               |
| `AMano.dc.html`       | 7 · Type or correct the code by hand                                          |

`canvas.json` keeps the layout and the notes. They are restated below.

## Rules the frames encode

- **One flow, typed or scanned.** The EAN is stored, looked up, and only
  empty fields (brand, format) are filled. No confirmation step; a toast says
  what was filled. An unknown code is stored anyway. A line that already has a
  different EAN asks first. Pending or purchased line: same flow.
- **Suggestions.** When the catalogue disagrees with a field the line already
  has (name, brand, format), nothing is overwritten. The field gets a bulb
  (lucide `Lightbulb`; Sparkles is reserved for AI) before its chevron.
  Tapping it opens a tooltip with the catalogue value, «de Open Food Facts»,
  and the 10d discs: ✕ red (ignore) on the left, ✓ green (use) on the right.
- **Opening.** Right after a scan, the first differing field's tooltip opens
  on its own; the rest show folded. Tapping outside folds it. Reopening the
  sheet later shows no bulbs (see the note below).
- **Ripple.** A bulb that just appeared plays a filled disc growing from under
  the button to 1.6× while fading, 2–3 times, then stops (looped in 4b only so
  the frame shows it). None with `prefers-reduced-motion`.
- **Undo.** ✓ turns the bulb into undo (`RotateCcw`, same accent treatment,
  never ripples); its tooltip shows «Antes» and ✓ restores, bringing the bulb
  back. Undo lives only while the sheet is open.
- **Ignore.** ✕ removes the bulb while the sheet stays open. Nothing is
  stored (see the note below).
- **Empty fields.** «Sin marca», «Sin cantidad», «Sin formato», «Sin tiendas»,
  «Sin código» in italics and `--ink-2`, never «—». Dashes in figure cells
  stay.
- **Button order.** Negative on the left, affirmative on the right.

## Changed after approval (2026-11-20)

Suggestions are not stored. They come only from the lookup a scan or a typed
code makes, and live while the sheet stays open. Reopening the sheet shows no
bulbs, so an ignored one comes back only if the same code is scanned again.
The canvas sticky still says the sheet reopens with the bulbs folded; this
note wins over it.
