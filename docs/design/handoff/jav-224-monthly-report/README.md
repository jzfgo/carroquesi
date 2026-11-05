# JAV-224 — monthly spend report (approved 2026-11-05)

Approved frames for the monthly spend report email, its opt-out pages and the
in-app setting. Designed in Claude Design (canvas «Informe mensual · JAV-224»),
copied here verbatim except for list and member names, which are placeholders.
Implementation: JAV-229 (templates and pages), JAV-230 (baseline), JAV-217
(coverage footer).

Like the rest of this handoff, the frames are spec, not production code: read
the HTML/CSS and match the visual output. They load `./support.js`, but the
viewer script sits one folder up (`../support.js`), so the canvas runtime does
not load here. Open them as plain HTML or read the source.

## Frames

| File                | What it shows                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Main.dc.html`      | The email for a normal month, with real figures (Casa, October 2026)                                      |
| `Quiet.dc.html`     | A thin month: first month of a list, one purchase, no baseline, empty "to save" block (Pamplona, June 2026) |
| `Plain.dc.html`     | The plain-text body of `Main`                                                                               |
| `Dark.dc.html`      | `Main` in dark mode, with the app's dark tokens                                                             |
| `Unsub.dc.html`     | Opt-out confirmation, opened by the email link (GET shows a button, nothing else)                           |
| `UnsubDone.dc.html` | After the button (POST records the opt-out)                                                                 |
| `Setting.dc.html`   | The "Informe mensual" switch in the list options sheet (21a), owner only                                    |

`canvas.json` keeps the layout and two notes: the baseline rule and the copy
templates. Both are restated below.

## Rules the frames encode

**Copy is deterministic.** Every sentence is a fixed template with slots. No
LLM, no product categories, no grammatical gender ("Pagaste…", never "la/lo
compraste"). Templates:

- **Preheader:** "{Mes}: {total} en {n} compra(s), un {±%} más/menos que tu
  media de los últimos {N} meses." Without a baseline it stops after
  "compra(s)".
- **Headline**, by difference with the baseline: ≥ +5 % "{Mes} costó {Δ €} más
  que tu media de los últimos {N} meses"; ≤ −5 % "…menos…"; in between
  "{Mes}: {total}, en línea con tu media de los últimos {N} meses"; no baseline
  "{Mes}: {total} en {n} compra(s)".
- **Lede:** "{n} compras, {Δn} más/menos que en {mes anterior}. Los cinco
  productos que más subieron/bajaron suman {X €} de la diferencia." No
  baseline: "Es el primer mes con compras en esta lista, así que todavía no hay
  con qué compararlo."
- **Section title:** "Qué explica la subida" or "la bajada".
- **Habit:** the product in the most purchases, at least 3: "{Producto} aparece
  en {k} de las {n} compras: {uds} uds y {€}, el {%} % del gasto de la lista."
  Hidden when no product reaches 3.
- **Suggestion:** "Pagaste {precio} en {tienda}. En {otra tienda} pagaste
  {precio} el {dd/mm}." With €/kg on weighed lines.
- **Empty "to save":** fixed text, as in `Quiet`. It is the common case: with
  the JAV-216 thresholds, real data gives 0–3 suggestions a month.
- **Footer:** "{a} de {b} productos con precio · {c} de {d} tickets con total
  confirmado · " then either "{x €} del total sin asignar a un producto" or,
  when lines exceed the total, "los productos suman {x €} más que el ticket,
  seguramente por descuentos que el ticket no detalla".

**Baseline (JAV-230):** the mean of up to the 12 previous complete months
(every purchase's total confirmed), named in the copy ("tu media de los
últimos 5 meses"). Once a list has a year of data, a second comparison
appears: "frente a octubre de 2025".

**Sections that hide:** "Quién lo pidió" on single-member lists; "Un hábito"
when no product reaches 3 purchases. Without a baseline (`Quiet`) the email
keeps only the headline, the lede, "Lo que más pesó", "Para ahorrar" and the
footer: the Gasto/Compras tiles, the chart, "Qué explica…" and "Dónde" all
hide. With a baseline, "Dónde" shows one line when there is one store.

## Open for JAV-229

The frames do not settle these. Decide them in the implementation, and update
this list when they are decided.

- **Lede and section in the "en línea" band** (between −5 % and +5 %): the
  headline has a template, but the lede's "subieron/bajaron" and "Qué explica
  la subida/bajada" do not.
- **Units in the habit template:** "{uds} uds" has no rule for weighed lines
  (the suggestion template uses €/kg) or for the singular "ud".
- **"{c} de {d} tickets"** in the footer needs the same singular rule as
  "compra(s)" (`Quiet` reads "1 de 1 tickets").
- **Plain text body:** `Plain` drops the "Solo mostramos ahorros…" and
  "Precios por unidad…" lines, writes store counts as "(1)" instead of
  "1 compra", and loses the dot leader on long names. It needs a rule for
  truncating names and for which lines it keeps.
- **"Dónde" totals:** the frame sums line prices per store (681,92 €), not the
  confirmed ticket totals (681,95 €). Pick one; ticket totals keep the section
  in step with the headline.
- **Gender:** the disclaimer in `Main` and `Dark` says "con precios que tú
  mismo has pagado", which breaks the no-gender rule above. The approved copy
  stays as is here; the build should use "…con precios que ya has pagado en
  los últimos 90 días" unless design says otherwise.
- **Turning the report back on (launch blocker):** `Unsub`, `UnsubDone` and
  `Setting` promise the report can be re-enabled from the list. The backend has
  no way to do that today: an opt-out row goes away only when the list is
  deleted. Ship the switch with the pages, or change that copy before launch.

**Email constraints:** the build is table-based with inline styles. Web fonts
load only in some clients (not Gmail), so every face has a safe fallback:
Bree Serif → Georgia, Geist → the system sans, JetBrains Mono → Menlo/Consolas,
Patrick Hand SC → Bradley Hand/cursive. Dark mode follows
`prefers-color-scheme` where the client supports it.
