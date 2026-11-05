"""The monthly report as an email: HTML and plain text from one view.

Every sentence is a fixed template with slots, built here so it can be
tested; the templates only lay it out. No LLM, no product categories, and
no grammatical gender ("Pagaste…", never "la/lo compraste"). The approved
design and its copy rules are in docs/design/handoff/jav-224-monthly-report.
"""

import textwrap
from dataclasses import dataclass, field
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.db.models import List, User
from app.services.insights.data import shift_month
from app.services.insights.schemas import (
    Baseline,
    ByRequester,
    ByStore,
    CheaperElsewhere,
    Coverage,
    ProductMoves,
    ProductSpend,
    SpendReport,
    TopProducts,
    Totals,
)
from app.services.mailer import Email
from app.services.report_opt_out import opt_out_url

# Between a figure and its unit, so "100,83 €" never wraps apart.
NBSP = "\u00a0"
MONTHS = (
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre"
).split()
NUMBERS = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis"]
TOP_PRODUCTS = 5
# Within this of the baseline a month reads as "en línea": no rise or fall
# to explain.
IN_LINE = 0.05
# A habit needs this many trips; fewer is not a pattern.
HABIT_MIN_TRIPS = 3
# The tallest bar in the trend chart, in pixels.
BAR_MAX = 110
# Plain text: dot leaders end at this column.
TEXT_WIDTH = 46
# Store and requester share bars: the first is accent, the rest step down.
SHARE_COLOURS = ["accent", "mid", "low"]

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates" / "email"),
    autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=False),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


# --- formatting --------------------------------------------------------------


def eur(amount: float) -> str:
    """1234.5 -> "1.234,50 €", the Spanish way."""
    return f"{_number(amount, 2)}{NBSP}€"


def eur_whole(amount: float) -> str:
    """A difference in round euros: 250.4 -> "250 €"."""
    return f"{_number(amount, 0)}{NBSP}€"


def eur_short(amount: float) -> str:
    """Drops ",00": a threshold reads "1 €", not "1,00 €"."""
    return eur_whole(amount) if amount == int(amount) else eur(amount)


def signed_eur(amount: float) -> str:
    return ("+" if amount > 0 else "−") + eur(abs(amount))


def pct(fraction: float) -> str:
    return f"{fraction * 100:+.0f}{NBSP}%".replace("-", "−")


def _number(value: float, decimals: int) -> str:
    whole, _, cents = f"{value:,.{decimals}f}".partition(".")
    whole = whole.replace(",", ".")
    return f"{whole},{cents}" if decimals else whole


def sentence(clause: str) -> str:
    """Capitalise the first letter only; Jinja's `capitalize` lowers the rest."""
    return clause[:1].upper() + clause[1:]


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def _count(n: int, one: str, many: str) -> str:
    return f"{n} {_plural(n, one, many)}"


def month_label(period: str) -> str:
    return f"{_month_name(period)} de {period[:4]}"


def _month_name(period: str) -> str:
    return MONTHS[int(period.split("-")[1]) - 1]


def quantity_label(product: ProductSpend) -> str | None:
    """ "9 uds", "1 ud", "1,4 kg"; None when the lines cannot say."""
    q = product.quantity
    if q is None:
        return None
    if product.measure == "kg":
        return f"{_trimmed(q)} kg"
    return f"{_trimmed(q)} {'ud' if q == 1 else 'uds'}"


def _trimmed(value: float) -> str:
    """Up to two decimals, no trailing zeros: 1.40 -> "1,4", 6.0 -> "6"."""
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


# --- the copy ----------------------------------------------------------------


def baseline_phrase(baseline: Baseline, period: str) -> str:
    """What the month is compared with, as the headline says it."""
    months = baseline.months
    if len(months) > 1:
        return f"tu media de los últimos {len(months)} meses"
    (only,) = months
    # One month: name it. The year only when it is not this month's.
    return _month_name(only) if only[:4] == period[:4] else month_label(only)


def baseline_caption(baseline: Baseline) -> str:
    """Which months the mean is over, in words the reader can check."""
    months = baseline.months
    mean = eur(baseline.mean)
    if len(months) == 1:
        return f"Media de {_month_name(months[0])}, el único mes completo disponible: {mean}."
    if shift_month(months[0], len(months) - 1) != months[-1]:
        # With gaps a range would claim months it left out.
        return f"Media de los {len(months)} meses completos disponibles: {mean}."
    first, last = months[0], months[-1]
    if first[:4] == last[:4]:
        span = f"de {_month_name(first)} a {_month_name(last)}"
    else:
        span = f"de {month_label(first)} a {month_label(last)}"
    return f"Media {span}, los meses completos disponibles: {mean}."


def _direction(totals: Totals) -> str | None:
    """ "up", "down", or None: in line with the baseline, or no baseline."""
    if totals.vs_average is None:
        return None
    if totals.vs_average >= IN_LINE:
        return "up"
    if totals.vs_average <= -IN_LINE:
        return "down"
    return None


def _total(totals: Totals) -> str:
    # A line sum stood in for some ticket: the app marks that with «≈».
    return f"≈ {eur(totals.total)}" if totals.approximate else eur(totals.total)


def _purchases(n: int) -> str:
    return _count(n, "compra", "compras")


def headline(totals: Totals, period: str) -> str:
    month = sentence(_month_name(period))
    if totals.trips == 0:
        return f"{month}: sin compras"
    if totals.baseline is None or totals.vs_average is None:
        return f"{month}: {_total(totals)} en {_purchases(totals.trips)}"
    against = baseline_phrase(totals.baseline, period)
    direction = _direction(totals)
    if direction is None:
        return f"{month}: {_total(totals)}, en línea con {against}"
    diff = eur_whole(abs(totals.total - totals.baseline.mean))
    more = "más" if direction == "up" else "menos"
    return f"{month} costó {diff} {more} que {against}"


def preheader(totals: Totals, period: str, list_name: str) -> str:
    month = sentence(_month_name(period))
    if totals.trips == 0:
        return f"{month}: sin compras en {list_name}."
    start = f"{month}: {_total(totals)} en {_purchases(totals.trips)}"
    if totals.baseline is None or totals.vs_average is None:
        return f"{start}."
    against = baseline_phrase(totals.baseline, period)
    direction = _direction(totals)
    if direction is None:
        return f"{start}, en línea con {against}."
    more = "más" if direction == "up" else "menos"
    return f"{start}, un {abs(totals.vs_average) * 100:.0f} % {more} que {against}."


def _trips_sentence(totals: Totals, period: str) -> str:
    n, previous = totals.trips, totals.trips_previous
    text = _purchases(n)
    if previous is None:
        return f"{sentence(text)}."
    before = _month_name(shift_month(period, -1))
    d = n - previous
    if d > 0:
        return f"{sentence(text)}, {d} más que en {before}."
    if d < 0:
        return f"{sentence(text)}, {-d} menos que en {before}."
    same = _plural(n, "la misma", "las mismas")
    return f"{sentence(text)}, {same} que en {before}."


def _moves_sentence(moves: ProductMoves, direction: str) -> str | None:
    rows = moves.rises if direction == "up" else moves.falls
    if not rows:
        return None
    total = eur(abs(sum(m.delta for m in rows)))
    k = len(rows)
    if k == 1:
        verb = "subió" if direction == "up" else "bajó"
        return f"El producto que más {verb} suma {total} de la diferencia."
    verb = "subieron" if direction == "up" else "bajaron"
    return f"Los {NUMBERS[k]} productos que más {verb} suman {total} de la diferencia."


def lede(totals: Totals, moves: ProductMoves, period: str) -> str:
    if totals.trips == 0:
        return "Este mes no se registró ninguna compra en esta lista."
    if totals.trips_previous is None:
        return (
            "Es el primer mes con compras en esta lista, así que todavía no hay con qué compararlo."
        )
    first = _trips_sentence(totals, period)
    if totals.baseline is None or totals.vs_average is None:
        return (
            f"{first} Todavía no hay un mes completo con el que compararlo: "
            "un mes cuenta cuando todos sus tickets tienen el total confirmado."
        )
    direction = _direction(totals)
    second = _moves_sentence(moves, direction) if direction else None
    return f"{first} {second}" if second else first


def habit(top: TopProducts, totals: Totals) -> str | None:
    p = top.most_frequent
    if p is None or p.trips < HABIT_MIN_TRIPS:
        return None
    start = f"{p.name} aparece en {p.trips} de las {_purchases(totals.trips)}"
    figures = [x for x in [quantity_label(p), eur(p.amount) if p.amount else None] if x]
    if not figures:
        return f"{start}."
    detail = " y ".join(figures)
    if not p.amount or not totals.total:
        return f"{start}: {detail}."
    share = p.amount / totals.total * 100
    of_spend = "menos del 1 %" if share < 1 else f"el {share:.0f} %"
    return f"{start}: {detail}, {of_spend} del gasto de la lista."


def coverage_clauses(cov: Coverage) -> list[str]:
    """The footer's honesty line, as clauses each surface joins its own way.

    Empty for a month with no trips: there is nothing to qualify.
    """
    if cov.trips == 0:
        return []
    clauses = []
    # A trip can carry a total and no lines; "0 de 0 productos" says nothing.
    if cov.lines_total:
        product = _plural(cov.lines_total, "producto", "productos")
        clauses.append(f"{cov.lines_priced} de {cov.lines_total} {product} con precio")
    ticket = _plural(cov.trips, "ticket", "tickets")
    clauses.append(f"{cov.trips_confirmed} de {cov.trips} {ticket} con total confirmado")
    if cov.unattributed is None or cov.lines_over is None:
        # No confirmed total to measure against; the ticket clause says so.
        return clauses
    # The approved copy has one clause. Both appear only when some tickets
    # fall short and others run over, so neither gap hides the other.
    if cov.unattributed > 0 or not cov.lines_over:
        clauses.append(f"{eur(cov.unattributed)} del total sin asignar a un producto")
    if cov.lines_over:
        n = cov.trips_lines_over
        the_ticket = _plural(n, "el ticket", "los tickets")
        over = (
            f"los productos suman {eur(cov.lines_over)} más que {the_ticket}, "
            f"seguramente por descuentos que {the_ticket} {_plural(n, 'no detalla', 'no detallan')}"
        )
        if cov.unattributed > 0:
            over = f"{_plural(n, 'en otro ticket', 'en otros tickets')} {over}"
        clauses.append(over)
    return clauses


# --- the view ----------------------------------------------------------------


@dataclass
class Row:
    name: str
    value: str
    detail: str | None = None
    # A share bar's width in percent, and its colour role.
    share: float = 0.0
    colour: str = "low"


@dataclass
class Bar:
    month: str
    label: str
    value: str
    height: int
    current: bool


@dataclass
class Saving:
    name: str
    monthly: str
    text: str


@dataclass
class Section:
    title: str
    rows: list[Row] = field(default_factory=list)


def _share_rows(rows: list[Row], amounts: list[float]) -> list[Row]:
    whole = sum(amounts)
    for k, (row, amount) in enumerate(zip(rows, amounts, strict=True)):
        row.share = round(amount / whole * 100, 1) if whole else 0.0
        row.colour = SHARE_COLOURS[min(k, len(SHARE_COLOURS) - 1)]
    return rows


def _chart(totals: Totals) -> list[Bar]:
    points = list(totals.series)
    # Leading empty months are before the list, or say nothing yet.
    while len(points) > 1 and points[0].total == 0:
        points.pop(0)
    top = max((p.total for p in points), default=0) or 1
    return [
        Bar(
            month=_month_name(p.month),
            label=_month_name(p.month)[:3],
            value=("≈ " if p.approximate else "") + _number(p.total, 0),
            height=max(2, round(p.total / top * BAR_MAX)) if p.total else 0,
            current=p.month == totals.period,
        )
        for p in points
    ]


def _chart_caption(totals: Totals) -> str:
    approx = any(p.approximate for p in totals.series)
    parts = [
        "Euros de tickets; ≈ marca un mes con algún ticket sin total confirmado."
        if approx
        else "Euros de tickets confirmados."
    ]
    if totals.baseline is not None:
        parts.append(baseline_caption(totals.baseline))
    if totals.vs_last_year is not None:
        last_year = month_label(shift_month(totals.period, -12))
        parts.append(f"Frente a {last_year}: {pct(totals.vs_last_year)}.")
    return " ".join(parts)


def _explain(moves: ProductMoves, direction: str, period: str) -> Section:
    rows = moves.rises if direction == "up" else moves.falls
    month = _month_name(period)
    return Section(
        title="Qué explica la subida" if direction == "up" else "Qué explica la bajada",
        rows=[
            Row(
                name=m.name,
                value=signed_eur(m.delta),
                detail=f"{eur(m.amount)} en {month} · media {eur(m.average)}",
            )
            for m in rows
        ],
    )


def _top_row(p: ProductSpend) -> Row:
    quantity = quantity_label(p)
    # A single unit says nothing; a pack reads "Mini hamburguesa, pack de 6".
    if p.measure == "ud" and p.quantity == 1:
        quantity = None
    meta = [x for x in [p.brand, quantity] if x]
    return Row(name=p.name, value=eur(p.amount), detail=" · ".join(meta) or None)


def _savings(savings: CheaperElsewhere) -> list[Saving]:
    out = []
    for s in savings.suggestions:
        per = "/kg" if s.basis == "kg" else ""
        out.append(
            Saving(
                name=f"{s.name} · {s.brand}" if s.brand else s.name,
                monthly=f"{eur(s.monthly_eur)}/mes",
                text=(
                    f"Pagaste {eur(s.paid_price)}{per} en {s.paid_store}. "
                    f"En {s.cheaper_store} pagaste {eur(s.cheaper_price)}{per} "
                    f"el {s.cheaper_seen_at.strftime('%d/%m')}."
                ),
            )
        )
    return out


def _savings_rule(savings: CheaperElsewhere) -> tuple[str, str]:
    th = savings.thresholds
    least = f"al menos un {th.min_saving_pct * 100:.0f} % y {eur_short(th.min_monthly_eur)} al mes"
    shown = (
        f"Solo mostramos ahorros de {least}, con precios que ya has pagado "
        f"en los últimos {th.window_days} días."
    )
    empty = (
        "Este mes no hay sugerencias. Las hacemos cuando has pagado el mismo producto "
        f"en dos cadenas y la diferencia es de {least}."
    )
    return shown, empty


def report_view(report: SpendReport, list_name: str) -> dict:
    insights = {insight.type: insight for insight in report.insights}
    totals = insights["totals"]
    by_store = insights["by_store"]
    top = insights["top_products"]
    moves = insights["product_moves"]
    requesters = insights["by_requester"]
    savings = insights["cheaper_elsewhere"]
    assert isinstance(totals, Totals)
    assert isinstance(by_store, ByStore)
    assert isinstance(top, TopProducts)
    assert isinstance(moves, ProductMoves)
    assert isinstance(requesters, ByRequester)
    assert isinstance(savings, CheaperElsewhere)
    period = report.period
    empty = totals.trips == 0
    # Without a baseline the email keeps the headline, the lede, the top
    # products, the savings and the footer; the rest compares, so it hides.
    compared = not empty and totals.baseline is not None and totals.vs_average is not None
    direction = _direction(totals) if compared else None
    shown_rule, empty_rule = _savings_rule(savings)

    tiles, text_tiles = [], []
    if compared and totals.baseline is not None and totals.vs_average is not None:
        months = _count(len(totals.baseline.months), "mes", "meses")
        tiles = [
            ("Gasto", _total(totals)),
            (f"Media {months}", pct(totals.vs_average)),
            ("Compras", str(totals.trips)),
        ]
        # A tile's label sits over its figure; a line of text needs the verb.
        text_tiles = [tiles[0], (f"Frente a la media de {months}", tiles[1][1]), tiles[2]]
    chart = _chart(totals) if compared else []
    stores = (
        _share_rows(
            [
                Row(name=s.name, value=eur(s.amount), detail=_purchases(s.trips))
                for s in by_store.stores
            ],
            [s.amount for s in by_store.stores],
        )
        if compared
        else []
    )
    # A list with one member has one requester; so can a shared list in a
    # month only one person filled. Either way the split says nothing.
    people = (
        _share_rows(
            [
                Row(
                    name=r.name,
                    value=eur(r.amount),
                    detail=_count(r.lines, "producto", "productos"),
                )
                for r in requesters.requesters
            ],
            [r.amount for r in requesters.requesters],
        )
        if compared and len(requesters.requesters) > 1
        else []
    )
    explain = _explain(moves, direction, period) if direction else None
    return {
        "list_name": list_name,
        "period_label": f"{_month_name(period)} {period[:4]}",
        "preheader": preheader(totals, period, list_name),
        "headline": headline(totals, period),
        "lede": lede(totals, moves, period),
        "empty": empty,
        "tiles": tiles,
        "text_tiles": text_tiles,
        "chart": chart,
        "chart_title": f"Últimos {NUMBERS[len(chart)]} meses" if len(chart) > 1 else None,
        "chart_caption": _chart_caption(totals) if chart else None,
        "chart_alt": "Gasto mensual: " + ", ".join(f"{b.month} {b.value} €" for b in chart),
        "explain": explain if explain and explain.rows else None,
        "stores": stores,
        "people": people,
        "top": [_top_row(p) for p in top.products[:TOP_PRODUCTS]],
        "habit": habit(top, totals) if compared else None,
        "savings": _savings(savings),
        "savings_rule": shown_rule,
        "savings_empty": empty_rule,
        "coverage": coverage_clauses(report.coverage),
    }


# --- plain text --------------------------------------------------------------


def leader(name: str, value: str, suffix: str = "", width: int = TEXT_WIDTH) -> str:
    """ "  Gasto ......... 681,95 €": the value ends at `width`. A long
    name is cut with "…" so at least three dots stay between them; the
    suffix (a quantity, a count) is never cut."""
    room = width - 2 - len(value) - 5 - len(suffix)
    if len(name) > room:
        name = name[: max(room - 1, 1)].rstrip() + "…"
    label = name + suffix
    dots = "." * max(width - 2 - len(label) - len(value) - 2, 3)
    return f"  {label} {dots} {value}"


def wrap(text: str, indent: str = "") -> str:
    return textwrap.fill(
        text, width=62, initial_indent=indent, subsequent_indent=indent, break_on_hyphens=False
    )


_env.filters["leader"] = leader
_env.filters["wrap"] = wrap
_env.filters["sentence"] = sentence


# --- the email ---------------------------------------------------------------


def build_report_email(report: SpendReport, lst: List, owner: User) -> Email:
    unsubscribe = opt_out_url(owner.id, lst.id)
    context = report_view(report, lst.name) | {
        "title_name": f"{lst.emoji} {lst.name}" if lst.emoji else lst.name,
        "unsubscribe_url": unsubscribe,
    }
    return Email(
        to=owner.email,
        # A header cannot hold a line break, and a list name can.
        subject=" ".join(
            f"{context['title_name']}: tu gasto de {month_label(report.period)}".split()
        ),
        text=_env.get_template("monthly_report.txt").render(context),
        html=_env.get_template("monthly_report.html").render(context),
        # RFC 8058: mail clients show their own unsubscribe button and POST
        # to the link, with no page in between.
        headers={
            "List-Unsubscribe": f"<{unsubscribe}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )
