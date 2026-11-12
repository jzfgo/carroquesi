"""Reduced prices: what the month's marked-down lines cost, and what they
would have cost at the price on the label underneath.

Counts only lines with an old price, copied by hand from that label. It is
never guessed from an earlier purchase: the same article's list price moves.
"""

from app.services.insights.data import Window
from app.services.insights.schemas import Markdowns

__all__ = ["markdowns"]


def markdowns(w: Window, month: str) -> Markdowns:
    lines = [
        line
        for line in w.lines
        if line.month == month and line.amount is not None and line.amount_before is not None
    ]
    paid = sum(line.amount or 0.0 for line in lines)
    before = sum(line.amount_before or 0.0 for line in lines)
    return Markdowns(
        list_id=w.list_id,
        period=month,
        lines=len(lines),
        paid=round(paid, 2),
        before=round(before, 2),
        saved=round(before - paid, 2),
    )
