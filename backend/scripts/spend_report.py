#!/usr/bin/env python3
"""
Print one list's spend report for one month, straight from the database.

Usage:
    uv run python scripts/spend_report.py --list <list_id> --month YYYY-MM
        [--tz Europe/Madrid] [--json]
        [--min-saving-pct 0.10] [--min-monthly-eur 1.0] [--min-observations 1]
        [--window-days 90] [--max-spread-pct 0.15]

Reads DATABASE_URL like the app. The session is read-only at the database,
so pointing it at production cannot change anything.
"""

import argparse
import sys
from dataclasses import fields
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, text

from app.db.models import List
from app.db.session import get_engine
from app.services.insights.engine import compute_report
from app.services.insights.schemas import (
    ByRequester,
    ByStore,
    Cadence,
    CheaperElsewhere,
    SavingsThresholds,
    SpendReport,
    TopProducts,
    Totals,
)
from app.services.report_email import coverage_clauses


def _eur(amount: float) -> str:
    return f"{amount:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _pct(delta: float | None) -> str:
    return "—" if delta is None else f"{delta:+.0%}"


def _coverage(insight: TopProducts | ByRequester) -> str:
    return f"{insight.lines_priced}/{insight.lines_total} líneas con precio"


def _print(report: SpendReport, list_name: str) -> None:
    print(f"{list_name} · {report.period} ({report.tz})")
    for insight in report.insights:
        print()
        match insight:
            case Totals():
                mark = "≈ " if insight.approximate else ""
                print(
                    f"Total: {mark}{_eur(insight.total)}  ·  {insight.trips} compras "
                    f"({insight.trips_confirmed} con total confirmado)"
                )
                base = insight.baseline
                over = f"{base.months[0]}..{base.months[-1]}, {len(base.months)}" if base else "—"
                print(
                    f"  vs mes anterior {_pct(insight.vs_previous)}  ·  "
                    f"vs base ({over}) {_pct(insight.vs_average)}  ·  "
                    f"vs hace un año {_pct(insight.vs_last_year)}"
                )
                trend = "  ".join(
                    f"{p.month}: {'≈' if p.approximate else ''}{_eur(p.total)}"
                    for p in insight.series
                )
                print(f"  {trend}")
            case ByStore():
                print("Por tienda:")
                for s in insight.stores:
                    print(f"  {s.name:<24} {_eur(s.amount):>12}  ({s.trips} compras)")
            case TopProducts():
                print(f"Top productos ({_coverage(insight)}):")
                for p in insight.products:
                    label = f"{p.name} · {p.brand}" if p.brand else p.name
                    new = "  NUEVO" if p.new else ""
                    print(f"  {label:<32} {_eur(p.amount):>10}  {_pct(p.vs_average):>6}{new}")
            case ByRequester():
                print(f"Por quien lo pidió ({_coverage(insight)}):")
                for r in insight.requesters:
                    print(f"  {r.name:<24} {_eur(r.amount):>12}")
            case Cadence():
                gap = (
                    "—"
                    if insight.mean_days_between is None
                    else f"{insight.mean_days_between:.1f} días"
                )
                print(f"Frecuencia: {insight.trips} compras, una cada {gap}")
            case CheaperElsewhere():
                print(f"Para ahorrar ({len(insight.suggestions)}):")
                for s in insight.suggestions:
                    unit = "/kg" if s.basis == "kg" else "/ud"
                    print(
                        f"  {s.name}: {_eur(s.paid_price)}{unit} en {s.paid_store}; "
                        f"lo pagaste a {_eur(s.cheaper_price)}{unit} en {s.cheaper_store} "
                        f"el {s.cheaper_seen_at:%d/%m}  →  {_eur(s.monthly_eur)}/mes"
                        f" ({s.saving_pct:.0%})"
                    )
    if clauses := coverage_clauses(report.coverage):
        print(f"\nCobertura: {' · '.join(clauses)}.")
    if report.coverage.tripless_lines:
        print(f"{report.coverage.tripless_lines} líneas compradas sin ticket quedan fuera.")


def _read_only(session: Session) -> None:
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        session.connection().execute(text("SET TRANSACTION READ ONLY"))
    elif dialect == "sqlite":
        session.connection().execute(text("PRAGMA query_only = ON"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--list", required=True, dest="list_id")
    parser.add_argument("--month", required=True, help="YYYY-MM")
    parser.add_argument("--tz", default="Europe/Madrid")
    parser.add_argument("--json", action="store_true")
    for f in fields(SavingsThresholds):
        parser.add_argument(
            f"--{f.name.replace('_', '-')}", type=type(f.default), default=f.default
        )
    args = parser.parse_args()
    th = SavingsThresholds(**{f.name: getattr(args, f.name) for f in fields(SavingsThresholds)})

    with Session(get_engine()) as session:
        _read_only(session)
        lst = session.get(List, args.list_id)
        if lst is None:
            sys.exit(f"No list with id={args.list_id!r}")
        list_name = lst.name
        report = compute_report(session, lst.id, args.month, ZoneInfo(args.tz), th)
        session.rollback()

    if args.json:
        print(report.model_dump_json(indent=2))
    else:
        _print(report, list_name)


if __name__ == "__main__":
    main()
