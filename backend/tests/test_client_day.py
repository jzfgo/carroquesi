"""The X-Client-Timezone resolver."""

from datetime import UTC
from zoneinfo import ZoneInfo

from app.services.client_day import resolve_timezone


def test_missing_timezone_resolves_to_utc():
    assert resolve_timezone(None) is UTC


def test_unknown_timezone_resolves_to_utc():
    assert resolve_timezone("Not/AZone") is UTC


def test_malformed_timezone_resolves_to_utc():
    assert resolve_timezone("../etc/passwd") is UTC


def test_valid_timezone_resolves_to_itself():
    assert resolve_timezone("Europe/Madrid") == ZoneInfo("Europe/Madrid")
