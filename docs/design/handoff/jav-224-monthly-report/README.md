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
  seguramente por descuentos que el ticket no detalla". Decided in JAV-217:
  - "producto" and "ticket" agree with their count ("1 de 1 ticket", where
    `Quiet` reads "1 de 1 tickets").
  - Each confirmed ticket is compared with its own lines. Money missing from
    the lines and money the lines add above the ticket are kept apart, so one
    ticket's gap cannot hide another's. When some tickets fall short and
    others run over, both clauses print: "… · 5,00 € del total sin asignar a
    un producto · en otro ticket los productos suman 5,00 € más que el
    ticket, seguramente por descuentos que el ticket no detalla". «en otros
    tickets… que los tickets no detallan» when several run over.
  - The over clause names only the tickets that run over, so its singular
    or plural follows their count.
  - The products clause drops when the month has no lines.
  - The gap clauses drop when no ticket has a confirmed total: a line sum
    standing in for the total always reads as 0 €.
  - A month with no purchases has no coverage line at all.
  - The plain-text body writes the clauses as sentences, as `Plain` does.

**Baseline (JAV-230):** the mean of up to the 12 previous complete months
(every purchase's total confirmed), named in the copy ("tu media de los
últimos 5 meses"). Once a list has a year of data, a second comparison
appears: "frente a octubre de 2025".

**Sections that hide:** "Quién lo pidió" on single-member lists; "Un hábito"
when no product reaches 3 purchases. Without a baseline (`Quiet`) the email
keeps only the headline, the lede, "Lo que más pesó", "Para ahorrar" and the
footer: the Gasto/Compras tiles, the chart, "Qué explica…" and "Dónde" all
hide. With a baseline, "Dónde" shows one line when there is one store.

## Decided in JAV-229

The frames did not settle these. JAV-229 decided them as follows.

- **The "en línea" band** (between −5 % and +5 %): the lede keeps only its
  first sentence ("26 compras, 2 más que en septiembre.") and "Qué explica…"
  hides. There is no change to explain.
- **Units:** "9 uds", "1 ud", "1,4 kg" (up to two decimals). A single unit
  prints nothing in "Lo que más pesó", as in `Quiet`. A product bought both by
  weight and by unit, or weighed with no weight, prints no quantity. A habit
  with no price drops the money: "Pan aparece en 4 de las 26 compras."
- **Movers that outweigh the difference:** "Los cinco productos que más
  subieron suman {X €} de la diferencia" drops when X is larger than the
  headline's difference. That happens when other products moved the other
  way, or the lines run over the tickets. The "Qué explica…" table still shows.
- **A difference under 1 €** keeps its cents ("costó 0,40 € más"); it would
  otherwise round to "0 €".
- **A month with no purchases:** headline "{Mes}: sin compras", lede "Este mes
  no se registró ninguna compra en esta lista.", then only the footer's
  unsubscribe line.
- **History but no complete month yet:** the lede says why there is no
  comparison: "Todavía no hay un mes completo con el que compararlo: un mes
  cuenta cuando todos sus tickets tienen el total confirmado." The first-month
  sentence is only for a list's first month.
- **One-month baseline:** named by its month, not "los últimos 1 meses":
  "Octubre costó 50 € más que septiembre". The chart caption: "Media de
  septiembre, el único mes completo disponible: …". With gaps between the
  months, the caption gives the count, not a range.
- **Same month last year:** a sentence at the end of the chart caption:
  "Frente a octubre de 2025: +12 %."
- **The chart** drops leading empty months (before the list, or nothing to
  draw yet) and titles itself by what is left ("Últimos tres meses"). A month
  with a line sum standing in for a ticket prints "≈", and the caption says so.
- **"Quién lo pidió"** hides when the month has fewer than two requesters. That
  covers single-member lists, and shared lists where one person filled the
  month.
- **Plain text body:** keeps every line the HTML has, including "Solo
  mostramos ahorros…" and "Precios por unidad…". Counts are written out ("1
  compra"). Leaders end at column 46; a long name is cut with "…" so at least
  three dots stay, and its quantity or count is never cut.
- **"Dónde" totals:** confirmed ticket totals, in step with the headline.
- **Gender:** the disclaimer reads "…con precios que ya has pagado en los
  últimos 90 días".
- **Turning the report back on:** the switch ships in its own PR, before the
  report reaches anyone (the `monthly_report` flag is off by default). Until
  then the pages' promise has nothing behind it.
- **An invalid opt-out link:** "Este enlace no es válido", in the same layout
  as `UnsubDone`, with "Abrir CarroQueSí".

**Email constraints:** the build is table-based with inline styles. Web fonts
load only in some clients (not Gmail), so every face has a safe fallback:
Bree Serif → Georgia, Geist → the system sans, JetBrains Mono → Menlo/Consolas,
Patrick Hand SC → Bradley Hand/cursive. Dark mode follows
`prefers-color-scheme` where the client supports it.
