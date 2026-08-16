"""Range and finiteness guards for money fields, in plain Python.

Not Pydantic constraints on purpose: any constraint able to reject NaN
crashes FastAPI's own 422 handler when it echoes the rejected value back.
Finiteness is worth more than a tidy error: Postgres stores NaN happily,
and every later read that serializes the figure then fails for everyone
on the list.
"""

import math

from fastapi import HTTPException, status


def reject_bad_amount(value: float | None, what: str) -> None:
    if value is None:
        return
    if not math.isfinite(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{what} must be a finite number",
        )
    if value < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{what} must not be negative",
        )


def reject_bad_price(price: float | None, price_per: str | None, where: str) -> None:
    """The rules ItemCreate states about a price, restated in plain Python.

    Any endpoint that prices items can break them the same way creating one
    can: an amount that is negative or not finite, or a unit with no amount
    to apply it to. One endpoint must not store what its neighbour refuses.
    """
    reject_bad_amount(price, f"{where}.price")
    if price_per is not None and price is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{where}.price_per requires {where}.price",
        )
