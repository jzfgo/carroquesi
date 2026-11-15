# JAV-227 — pack format and per-unit price (approved 2026-11-15)

Approved frames for a line's pack format («6 × 1,5 L», «108 g», «pack de
12») and the price per litre, kilo or unit it gives. Designed as a canvas
(«Formato de pack · JAV-227») and copied here verbatim, minus one board that
only compared row options. Implementation: JAV-12. Automatic filling: JAV-220.

Like the rest of this handoff, the frames are spec, not production code: read
the HTML/CSS and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime does
not load here. Open them as plain HTML or read the source. Shared classes are
in `cqs.css`. A dashed accent outline marks UI that does not exist yet.

## Frames

| File                    | What it shows                                                            |
| ----------------------- | ------------------------------------------------------------------------ |
| `Main.dc.html`          | 1 · Bought rows (21b): format in the meta, normalised price beneath      |
| `Ficha.dc.html`         | 2 · Item sheet (22a): €/L headline, «Formato» row with its source        |
| `Historial.dc.html`     | 3 · Price history (22b): mixed formats, all in €/L                       |
| `Ajustar.dc.html`       | 4 · Ajustar producto (10d): format taken from the name                   |
| `AjustarVacio.dc.html`  | 5 · Ajustar producto (10d): no format, folded into «Añadir formato»      |
| `AjustarRollos.dc.html` | 6 · Ajustar producto (10d): typed by hand, count only                    |

`canvas.json` keeps the layout and the notes. They are restated below.

## Model, as the frames read it

Normalised price = line price ÷ (quantity × pack count × unit content). The
quantity is still how many packs were bought. Two packs at 3,48 € of
6 × 1,5 L: 6,96 € ÷ 18 L = 0,39 €/L. With no content, the price is per unit
of the pack (12 rolls at 3,60 € = 0,30 €/ud). Weighed lines (`KILOGRAM`) do
not change and show no «Formato».

## Rules the frames encode

**Format and name.** A format taken from the name is removed from the name
on save: «Agua mineral 6x1,5L» becomes «Agua mineral» with the format
6 × 1,5 L. That is why rows and sheets show the plain name. If the format is
cleared later, the name does not get the text back.

**Format and quantity.** «Cantidad» holds units, or the weight of something
weighed in the store («1,12 kg»). The size of a package («1,5 L», «500 g»)
goes in «Formato», never in «Cantidad». The 10d help text says so: «Escribe
unidades (6) o el peso de lo que pesaste (1,12 kg)».

Today a non-weighed quantity with a unit is read as the package size. JAV-12
keeps that reading as a fallback for lines with no format, so nothing drops
out of the history between JAV-12 and JAV-220's backfill. A unit typed in
«Cantidad» after that keeps the same reading; it is not refused or moved.

**Backfill (JAV-220).** One pass over existing lines, dry-run first with a
diff report:

- A format found in a line's name is stripped from the name and stored with
  the source «del nombre». Old and new lines then share one name, so their
  history stays together.
- A package size found in a non-weighed «Cantidad» («1,5 L», «500 g») moves
  to «Formato», and «Cantidad» becomes 1. Someone typed it, so it counts as
  manual: no source note, never overwritten.

**Bases.** L is a basis of its own, apart from kg. Today `unit_price()` maps L
to kg; JAV-12 splits them, and the history never mixes them.

**Unit spelling.** Rows (21b) print the unit in uppercase, in the mono voice
of the record: «10,65 €/KG», «3,48 €/UD». Sheets and history use lowercase:
«10,65 €/kg», «3,48 €/ud». Both are on purpose.

**Format text.** «6 × 1,5 L» (count and content), «1,5 L» or «108 G» (count
1), «PACK DE 12» (count only). Uppercase in the mono voice of bought rows,
as typed elsewhere.

**Row (21b).** The format goes in the meta, between the quantity and the
brand: «2 UD · 6 × 1,5 L · BEZOYA». With a format, the small figure under the
line total is the normalised price («0,39 €/L», «10,65 €/KG», «0,30 €/UD»
for a count-only pack). Without one, the row is unchanged: price per unit
bought.

**Item sheet (22a).** With a format, «Último precio» shows the normalised
price, and beneath it the price per unit bought and the format. The store
rows show the normalised price too. «Producto» gains a «Formato» row. Its
source shows in grey beside the value: «del nombre», «del ticket», «de Open
Food Facts». A value typed by hand has no note. «Formato» can be edited on a
closed purchase too, and opens the same block as 10d: the format from the name
is filled in on save, so this is where a wrong one is seen. It is the only
«Producto» row editable on a closed purchase.

**History (22b).** If any entry has a format, the history uses the basis most
entries share (L, kg or ud). Minimum, maximum, last and the curve use that
basis. Each row shows the format under the date and the price per unit bought
under the normalised price, so a change is explained (the 5 L bottle is the
cheapest). An entry with no format, or with another basis (g against L), keeps
its own price in grey ink, out of the minimum and the curve. The footnote
explains it and shows only when there is such an entry. No source marker in
the history.

**Editing (10d, 13b).** Two fields: «Unidades» × «Peso». There is no
unit select: the weight is typed with its unit («1,5 L», «108 g», «33 cl»)
and the app reads it, as «Cantidad y precio» does (the Already-Told Rule).
The block sits under «Cantidad y precio»,
because it is a correction, not a step. With no format, one dashed row
«Añadir formato» (5); with a format, the open block (4). Under the fields,
the normalised price and the total content show at once, so a typo is easy
to spot. The source note sits under the block; touching a field removes it
and the value becomes manual, which automatic filling never overwrites
(JAV-220). 13b uses the same block, with the source «del ticket».

- «Unidades»: whole number ≥ 1; empty means 1.
- «Peso»: optional. When typed, a figure > 0 with one of these units:
  g, gr, gramo(s); kg, kilo(s); ml; cl; l, litro(s). Today only the display
  table (`formatQuantity.ts`) knows the long spellings. The pricing tables
  (`UNIT_TO_KG` in `quantity.py` and `itemCost.ts`, pinned by
  `quantityVectors.json`) know only g, kg, ml, cl, dl, l, and must grow to
  this list, vectors first.
- A figure with no unit is refused: the field shows «Añade la unidad: 1,5 L,
  108 g» in `--danger` text beneath, and «Hecho» stays disabled, like the old
  price in JAV-226. Without a weight, the price is per unit of the pack.
- The field is «Peso», not «Contenido»: for a pack of rolls, or of anything
  sold by the piece, «Peso · opcional» reads as safe to leave empty. Here
  «peso» also covers ml and L. In the model it is still `unit_content`.
- Emptying both fields removes the format.

**Automatic values need no confirmation.** A format from the name, the
receipt or Open Food Facts counts in the history at once. It is an attribute
of the line, not a price, so the Confirmed-Price Rule does not apply.

**Price format.** As in JAV-226: «0,39 €/L», «10,65 €/kg», the euro sign after
the figure. Where a caption sits over a figure, the unit moves to the
caption: «Precio / L» over «0,39 €».
