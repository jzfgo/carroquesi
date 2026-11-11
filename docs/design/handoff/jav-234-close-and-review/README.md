# JAV-234 — one set of parts for closing a trip and reviewing a receipt (approved 2026-11-11)

Closing a trip without a receipt (10b) and reviewing a scanned receipt (13a) do
the same job: they turn a cart into a closed purchase with a store, a date,
lines and prices. These frames give both sheets the same parts, and keep them
apart only where the job differs. Designed as a canvas («JAV-234 · Cerrar
compra + Revisar ticket») and copied here verbatim.

These frames **replace** 10b, 13a and 10d in `CarroQueSí - Handoff
(aprobados).dc.html` for every element listed below. They also change two
things in 18b: its list head's count and «Quitar todas», and its amber
difference card (see Table head and Notices below). The three notice frames
draw those changes and the save warning. Everything else in those
frames still holds, and so do the JAV-225 additions on the same sheets (the
«Peso» chip and «Escanear etiqueta», in `../jav-225-weighed-label/`), which
these frames leave out.

Like the rest of this handoff, the frames are spec, not production code: read
the HTML/CSS and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime does
not load here. Open them as plain HTML or read the source.

## Frames

| File                 | What it shows                                                  |
| -------------------- | -------------------------------------------------------------- |
| `Main.dc.html`       | 10b · Cerrar compra, with the shared parts                     |
| `13a.dc.html`        | 13a · Revisar ticket, with the shared parts                    |
| `10d.dc.html`        | 10d · Ajustar producto, with 13b's label style                 |
| `13a-warn.dc.html`   | 13a · the save warning: no store, no date, 2 unnamed lines     |
| `13a-cuadre.dc.html` | 13a · the blue cuadre notice above the warning (no store)      |
| `10b-warn.dc.html`   | 10b · the save warning: no store                               |

13b does not change, so it has no frame here.

## The shared parts

- **Header.** The title, then one row with two pills: store and date. The
  store pill opens the 10b store dropdown (with «+ otra») in both sheets; 13a
  loses its free-text store editor. A pill is solid when it has a value and
  dashed accent when it is empty («Poner fecha»). In a targeted attach (25b)
  13a's pills stay locked, as plain ink. 10b loses its subtitle («N productos
  pasan a comprados»): the count is in the table head.
- **Table head.** «Producto · N / Cant. / Importe». The money column is the
  line total, so it is «Importe» in both, never «Precio». Quantity is
  right-aligned in both. In 13a the head's checkbox checks or clears every
  line, so the head has no «Quitar todas» and no «N sin nombre» count (both
  from 18b): the save warning below says what is unnamed.
- **Rows.** The whole row is the button and a chevron at its edge says so. 10b
  loses its pencil.
- **Total row.** «Total» in caps, the figure in mono, no «€». 13a keeps its
  green cuadre disc. In 10b the total counts only confirmed prices: dashed
  suggestions count once confirmed.
- **Help text.** A short line under the total in both sheets, starting «Toca
  una línea para…».
- **Save button.** «Guardar compra · € N» in both: the sum of what will be
  saved. `Main`, `13a` and `10d` draw it enabled; the notice frames draw it
  disabled. It stays disabled until the sheet can save. 13a's frame shows
  «Poner fecha» only to draw the empty pill.
- **Notices over the save button.** One card shape for both: a bold title, an
  optional detail line, and a circled symbol at its top right (the shape of
  18b's difference card). Two tones:
  - **Info (blue tint, «i» disc): the cuadre.** «Faltan / Sobran € N para
    cuadrar» with 18b's detail line. It only informs: a total that does not
    match never blocks the save. This replaces 18b's amber card.
  - **Warning (amber tint, warning disc): what keeps the save disabled.** One
    sentence, «[what to do] para guardar esta compra», built from what is
    missing: «Indica la tienda», «Indica la tienda y la fecha», «Asigna un
    producto a 2 líneas», «Marca al menos una línea» (13a, no line checked),
    «Deja al menos un producto del carro» (10b, only hand-added lines left).
    Several join with «y»: «Indica la tienda y la fecha y asigna un producto
    a 2 líneas para guardar esta compra». It shows only while the button is
    disabled for one of these reasons, and nothing in it is a control: the
    pills and the rows are where things get fixed.
  - When both apply, the info card sits above the warning.
- **Line detail (10d and 13b).** The same back button (the parent sheet's
  title), the same field labels (11 px, caps, .08em tracking), the same
  primary button. The line total box in 10d reads «Importe», like the column.
  The action words stay different, because the jobs differ: «Asignar» in 13b,
  «Hecho» and «Quitar del carro» in 10d.

## What stays different

- 13a: the receipt thumbnail, the per-line checkboxes, the raw receipt line in
  mono with its annotation, «Pendientes de asignar» in 13b, the printed total
  to check against, «Volver a leer el ticket».
- 10b: «Confirmar los N precios sugeridos», «Añadir producto», «Escanear el
  ticket en su lugar».
