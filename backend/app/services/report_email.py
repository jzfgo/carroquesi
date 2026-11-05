"""The monthly report as an email: HTML and plain text from one context.

The content is a first, plain version. Its look is still to be designed,
so the templates hold no styling beyond what keeps them readable.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.db.models import List, User
from app.services.insights.data import shift_month
from app.services.insights.schemas import (
    Baseline,
    ByStore,
    CheaperElsewhere,
    SpendReport,
    TopProducts,
    Totals,
)
from app.services.mailer import Email
from app.services.report_opt_out import opt_out_url

MONTHS = (
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre"
).split()
TOP_PRODUCTS = 5

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates" / "email"),
    autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=False),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


def eur(amount: float) -> str:
    """1234.5 -> "1.234,50 €", the Spanish way."""
    whole, cents = f"{amount:,.2f}".split(".")
    return f"{whole.replace(',', '.')},{cents} €"


def pct(fraction: float) -> str:
    return f"{fraction * 100:+.0f} %".replace("-", "−")


_env.filters["eur"] = eur
_env.filters["pct"] = pct


def month_label(period: str) -> str:
    year, month = period.split("-")
    return f"{MONTHS[int(month) - 1]} de {year}"


def baseline_label(baseline: Baseline) -> str:
    """What the average is over, in words the reader can check."""
    months = baseline.months
    if len(months) == 1:
        return month_label(months[0])
    if shift_month(months[0], len(months) - 1) == months[-1]:
        first, last = months[0], months[-1]
        # "de mayo a julio de 2026", but both years when the range crosses one.
        start = _month_name(first) if first[:4] == last[:4] else month_label(first)
        return f"tu media de {start} a {month_label(last)}"
    # With gaps a range would claim months it left out.
    return f"tu media de {len(months)} meses"


def _month_name(period: str) -> str:
    return MONTHS[int(period.split("-")[1]) - 1]


def build_report_email(report: SpendReport, lst: List, owner: User) -> Email:
    insights = {insight.type: insight for insight in report.insights}
    totals = insights["totals"]
    by_store = insights["by_store"]
    top = insights["top_products"]
    savings = insights["cheaper_elsewhere"]
    assert isinstance(totals, Totals)
    assert isinstance(by_store, ByStore)
    assert isinstance(top, TopProducts)
    assert isinstance(savings, CheaperElsewhere)
    unsubscribe = opt_out_url(owner.id, lst.id)
    context = {
        "list_name": f"{lst.emoji} {lst.name}" if lst.emoji else lst.name,
        "month": month_label(report.period),
        "totals": totals,
        "baseline": baseline_label(totals.baseline) if totals.baseline else None,
        "last_year": month_label(shift_month(report.period, -12)),
        "stores": by_store.stores,
        "products": top.products[:TOP_PRODUCTS],
        "suggestions": savings.suggestions,
        "unsubscribe_url": unsubscribe,
    }
    return Email(
        to=owner.email,
        # A header cannot hold a line break, and a list name can.
        subject=" ".join(f"{context['list_name']}: tu gasto de {context['month']}".split()),
        text=_env.get_template("monthly_report.txt").render(context),
        html=_env.get_template("monthly_report.html").render(context),
        # RFC 8058: mail clients show their own unsubscribe button and POST
        # to the link, with no page in between.
        headers={
            "List-Unsubscribe": f"<{unsubscribe}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )
