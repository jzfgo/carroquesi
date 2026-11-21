# JAV-246 — pack format on the pending row (approved 2026-11-21)

Approved frames for where a pending line shows its pack format: the format
set with the `*` sigil (JAV-241), or filled in automatically. JAV-227 framed
only bought lines. These frames add pending (30a) and in-cart (33a). Designed
as a canvas («Formato en la fila pendiente · JAV-246») and copied here
verbatim.

As in the rest of this handoff, the frames are spec, not production code:
read the HTML and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime
does not load here. Open them as plain HTML or read the source. Styles are
inline. A dashed accent outline marks UI that does not exist yet.

## Frames

| File                | What it shows                                                     |
| ------------------- | ----------------------------------------------------------------- |
| `Main.dc.html`      | 1 · Pending (30a) and in cart (33a): the format in the meta       |
| `Cantidad.dc.html`  | 2 · The quantity column (21b) with a format, case by case          |
| `Secuencia.dc.html` | 3 · One line through pending, in cart and bought                  |

`canvas.json` keeps the layout and the rules note. The rules are restated
below.

## Rules the frames encode

**Meta order.** On the pending row the format comes first, then the brand:
«6 × 1,5 L · BEZOYA». This is the bought row's order (21b, «2 UD · 6 × 1,5 L ·
BEZOYA»), so at purchase the line changes only its typeface and gains the
quantity in front. Text is `formatPack(pack, true)`: «6 × 1,5 L», «108 G»,
«PACK DE 12». It is set in the written face, uppercase, in the meta's ink.

**Quantity column.** Unchanged from 21b: always the bare figure
(`formatQuantityColumn`), «2», «1», «1 KG». It counts packs, and the format
in the meta says what a pack is. No «PACKS» or «×» is added. With no quantity
typed, the column stays empty, and the line means one pack.

**In the cart.** Same as pending: the written voice, with ink a step lighter
(`--ink-2`), as for the name and the quantity today.

**Guessed formats.** A format from the name, an EAN, Open Food Facts or a
re-buy (`pack_source` `name`, `receipt`, `off`, `copied`) shows exactly like
one typed by hand. The source note lives only in the item sheet (22a), as in
the history (22b).

**Weighed lines.** `price_per = KILOGRAM`: no format, the row is unchanged.

**Long names.** The name wraps; the quantity column stays on one line.

## Implementation note

In `ItemCard.tsx` the meta for non-bought rows is `[item.brand]` today. It
becomes `[pack && formatPack(pack, true), item.brand]`. The quantity column
does not change.
