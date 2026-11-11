# JAV-225 — scanning a weighed-goods label (approved 2026-11-10)

Approved frames for scanning the barcode on a weighed article's label, to
record its weight and €/kg on a purchase line. Designed as a canvas
(«Etiquetas de peso · JAV-225») and copied here verbatim. Implementation:
JAV-222.

Like the rest of this handoff, the frames are spec, not production code: read
the HTML/CSS and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime does
not load here. Open them as plain HTML or read the source. Shared classes are
in `cqs.css`. A dashed accent outline marks UI that does not exist yet.

## Frames

| File                       | What it shows                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `Main.dc.html`             | 1 · Receipt review (13a) with a «Peso» chip on the lines that look weighed          |
| `Detalle.dc.html`          | 2 · Line detail (13b) with the 10d «Cantidad y precio» row and «Escanear etiqueta»  |
| `DetalleCorregido.dc.html` | 2b · The same detail after correcting a misread price: «Importe corregido»          |
| `Escaner.dc.html`          | 3 · The camera, aimed at one label for one line                                     |
| `Coincide.dc.html`         | 4 · Label read, its total matches the receipt line                                  |
| `NoCuadra.dc.html`         | 5 · «Revisa la etiqueta»: the total does not match, or the label is already used    |
| `Cierre.dc.html`           | 6 · Close without a receipt (10b) with the same «Peso» chip                         |
| `DetalleCierre.dc.html`    | 7 · «Ajustar producto» (10d) with «Escanear etiqueta»                               |
| `SinTicket.dc.html`        | 8 · Label read without a receipt: the label sets the amount                         |
| `Error.dc.html`            | 9 · «No reconozco esta etiqueta»                                                    |

`canvas.json` keeps the layout and the notes. They are restated below.

## Rules the frames encode

**When.** At close, at home, with the labels still on. Prices belong to
closed-trip records only, so there is nowhere to put a label's price earlier.
Scanning in the store and scanning several labels in one go are separate
issues.

**One button per line.** A dashed «Peso» chip shows on a row when the store's
labels give a weight (`reads_label_weight` on `GET /chains`), the line has no
weight yet, and either:

- the line has quantity 1 and its product has no EAN; or
- the product was bought by weight before.

A pack counts as quantity 1, so the EAN check does most of the filtering. The
line detail (13b, 10d) always has «Escanear etiqueta», for lines the rule
misses. Scanning is optional.

**No picker.** The line you tapped is the target. The camera stops on the
first read, as in 20a. The article code is remembered per item.

**«Cantidad y precio» in both details.** 13b uses the 10d row (quantity ×
price, «El precio se ajusta solo»), pre-filled from the receipt, and drops the
«Importe» field:

- Changing the quantity keeps the total and recalculates the price
  (`0,346 kg` turns 3,05 /ud into 8,82 /kg).
- Changing the price changes the total. This corrects a misread receipt.
- «Importe corregido · en el ticket X» shows only when the total no longer
  matches the receipt (`DetalleCorregido`). The receipt total is already at
  the top, so it is not repeated otherwise.

**Amounts.** With a receipt, the line keeps the receipt's amount and gains the
weight and €/kg. Without a receipt, the label sets the amount.

**One warning, the user decides.** `NoCuadra` covers two cases with the same
sheet and buttons («Volver a escanear», «Usarla de todas formas»). Only the
reason sentence changes:

- Total mismatch: «La etiqueta dice X y esta línea Y. Puede que sea otro
  artículo.»
- Label already on another line: «Esta etiqueta ya está en otra línea de
  {producto}. Puede ser la misma etiqueta dos veces, o dos artículos que pesan
  y cuestan lo mismo.»
- Both at once: both sentences.

A repeated label cannot block. The code has no serial number, so two articles
with the same weight and price give the same code.

**One failure state.** The backend answers every refusal with the same 404
(check digit, total, unknown chain, length; ADR-017). With a store hint the
refusal is final. `Error` offers «Reintentar» and «Escribir a mano».

**Offline.** The action stays visible. A tap refuses with the standard offline
toast (ADR-011). No frame of its own.

**Chain-neutral UI.** Nothing on screen depends on one chain: no sticker
colours, no reduced-price tag. The decoder's `reduced` flag stays internal.

**Wording.** «Artículo» for the physical thing that carries the label, never
«bandeja»: it can be a tray, a bag or anything else. «Producto» is the app's
product.

## Not decided here

The headers, table heads, edit cues and totals of 13a and 10b differ in the
app today. The frames copy the app as it is. Unifying them is its own issue.
