# JAV-226 — reduced prices (approved 2026-11-12)

Approved frames for showing a reduced price («precio bajado») next to the
price it had before. Designed as a canvas («Precios bajados · JAV-226») and
copied here verbatim, minus two boards that only compared marker options.
Implementation: JAV-221.

Like the rest of this handoff, the frames are spec, not production code: read
the HTML/CSS and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime does
not load here. Open them as plain HTML or read the source. Shared classes are
in `cqs.css`. A dashed accent outline marks UI that does not exist yet.

## Frames

| File                       | What it shows                                                                  |
| -------------------------- | ------------------------------------------------------------------------------ |
| `Main.dc.html`             | 1 · Bought rows (21b): a price-tag marker only when the old price is known     |
| `FichaConocido.dc.html`    | 2 · Item sheet (22a) with the old price and the saving                         |
| `FichaDesconocido.dc.html` | 3 · Item sheet (22a) for a reduced price with no old price: like any other     |
| `Historial.dc.html`        | 4 · Price history (22b): reduced prices are hollow points, out of the minimum  |
| `Rebajada.dc.html`         | 5 · Reduced label read: optional «Precio anterior» field, empty                |
| `Pareja.dc.html`           | 6 · «Precio anterior» filled in: the saving shows at once                      |
| `Rechazada.dc.html`        | 7 · «Precio anterior» lower than what was paid: warning, save button disabled  |
| `Informe.dc.html`          | 8 · Monthly report (HTML): the «Precios bajados» block                         |
| `InformePlano.dc.html`     | 9 · Monthly report (plain text)                                                |

`canvas.json` keeps the layout and the notes. They are restated below.

## Rules the frames encode

**No «reduced» state.** A line has an old price or it does not. Only a known
old price shows anywhere. A line with a reduced label and no old price looks
like any other line (Pechuga in 1, frame 3).

**The row marker.** A price tag drawn in ink, stroke only, before the amount.
No figures, no strikethrough, no colour (Grayscale Ink Rule). It must be
something you could draw with a pen. Rejected: «%» (reads as a percentage),
up/down arrows, coloured tags. The old price and the saving live in the item
sheet (progressive disclosure): «Antes 4,36 € · 30 % menos».

**History.** A reduced price, with or without an old price, does not count
for the minimum or for the line of the chart. It is a hollow point on its
own. It does count as «Último», because it is what you paid. The maximum is
unchanged. The footnote shows only when there is a hollow point. The sheet's
«Rastro» range («se paga entre…») uses the same rule.

**Entering the old price.** The reduced sticker covers the barcode of the old
label; only its printed price is visible. So there is no second scan: after
reading a reduced label, the sheet offers an optional «Precio anterior» field,
and you copy the figure you see.

- Empty: the line keeps what you paid, as in frame 3.
- Filled in: the sheet shows the old €/kg and the saving at once, so a typo
  is easy to spot (frame 6). The amount stays what you paid; the old price is
  stored next to it.
- One check: the old price must be higher than what you paid. If not, the
  field shows a warning and «Usar en esta línea» stays disabled until the
  figure is fixed or cleared (frame 7).
- A read error is JAV-225's frame 9, unchanged.

**Report.** Fixed template: «Pagaste {pagado} por {n} artículo(s) que antes
costaba(n) {antes}: {diferencia} menos.» It counts only lines with an old
price and is hidden when there are none. It goes after «Un hábito» and before
«Para ahorrar». Reduced prices never feed «Para ahorrar».

**Price format.** The euro sign goes after the figure: «3,05 €», on every
amount. Unit prices read «8,82 €/kg», «0,89 €/ud» («€/KG», «€/UD» in the mono
voice of bought rows), never «el kilo». A range puts the unit once, at the
end: «entre 11,95 y 12,60 €/kg». Where a caption sits over a figure, the unit
moves to the caption: «Precio / kg» over «8,82 €». The app and every
approved frame follow this rule. The archive project file
(`CarroQueSí - UI Polish.dc.html`) keeps the old «€ N» on purpose.

**Wording.** «Artículo», never «bandeja». Nothing on screen depends on one
chain.
