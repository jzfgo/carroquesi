# JAV-234 — one set of parts for closing a trip and reviewing a receipt (approved 2026-11-11)

Closing a trip without a receipt (10b) and reviewing a scanned receipt (13a) do
the same job: they turn a cart into a closed purchase with a store, a date,
lines and prices. These frames give both sheets the same parts, and keep them
apart only where the job differs. Designed as a canvas («JAV-234 · Cerrar
compra + Revisar ticket») and copied here verbatim.

These frames **replace** 10b, 13a and 10d in `CarroQueSí - Handoff
(aprobados).dc.html` for every element listed below. Everything else in those
frames still holds, and so do the JAV-225 additions on the same sheets (the
«Peso» chip and «Escanear etiqueta», in `../jav-225-weighed-label/`), which
these frames leave out.

Like the rest of this handoff, the frames are spec, not production code: read
the HTML/CSS and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime does
not load here. Open them as plain HTML or read the source.

## Frames

| File           | What it shows                                                  |
| -------------- | -------------------------------------------------------------- |
| `Main.dc.html` | 10b · Cerrar compra, with the shared parts                     |
| `13a.dc.html`  | 13a · Revisar ticket, with the shared parts                    |
| `10d.dc.html`  | 10d · Ajustar producto, with 13b's label style                 |

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
  right-aligned in both.
- **Rows.** The whole row is the button and a chevron at its edge says so. 10b
  loses its pencil.
- **Total row.** «Total» in caps, the figure in mono, no «€». 13a keeps its
  cuadre disc and its amber difference card. In 10b the total counts only
  confirmed prices: dashed suggestions count once confirmed. The amber card
  is not drawn here; 18b in the approved handoff shows it.
- **Help text.** A short line under the total in both sheets, starting «Toca
  una línea para…».
- **Save button.** «Guardar compra · € N» in both: the sum of what will be
  saved. The frames draw it enabled, but it stays disabled until the sheet can
  save: in 13a that needs a store and a date, in 10b a store. 13a's frame
  shows «Poner fecha» only to draw the empty pill.
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
