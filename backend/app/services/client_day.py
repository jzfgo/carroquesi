"""The viewer's declared timezone, for date rules.

Date rules in this app are about the day the user lived through, not the
UTC day the server stores. A browser declares its IANA timezone in the
X-Client-Timezone header; a client that sends none, or one the server
does not know, is judged in UTC. The header is trusted: it steers
accident-guards and trip boundaries, never anything security-relevant,
and every caller could reach the data through other writes anyway. See
ADR-012.
"""

from datetime import UTC, tzinfo
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, Header


def parse_timezone(name: str | None) -> ZoneInfo | None:
    """The zone `name` names, or None when it is missing or unknown."""
    if not name:
        return None
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError, ValueError:
        return None


def resolve_timezone(
    x_client_timezone: Annotated[str | None, Header()] = None,
) -> tzinfo:
    return parse_timezone(x_client_timezone) or UTC


ClientTimezone = Annotated[tzinfo, Depends(resolve_timezone)]
