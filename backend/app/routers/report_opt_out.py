"""The unsubscribe link in the monthly report.

GET only shows a page with a button: link scanners and mail previews open
links on their own, and must not unsubscribe anyone. POST does it, from
that button or from a mail client's one-click unsubscribe (RFC 8058).
Served on the frontend's domain through a Hosting rewrite of /u/**.
"""

from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.core.config import get_settings
from app.db.models import List
from app.dependencies import CurrentSession
from app.services.report_opt_out import opt_out, read_token

router = APIRouter(prefix="/u", include_in_schema=False)

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates"),
    autoescape=select_autoescape(enabled_extensions=("html",)),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


def _page(
    state: Literal["confirm", "done", "invalid"],
    lst: List | None = None,
    status_code: int = 200,
) -> HTMLResponse:
    html = _env.get_template("report_opt_out.html").render(
        state=state,
        list_name=lst.name if lst else "esta lista",
        app_url=get_settings().frontend_url.rstrip("/") + "/",
    )
    return HTMLResponse(html, status_code=status_code)


@router.get("/{token}")
def confirm_page(token: str, session: CurrentSession) -> HTMLResponse:
    ids = read_token(token)
    if ids is None:
        return _page("invalid", status_code=404)
    return _page("confirm", session.get(List, ids[1]))


@router.post("/{token}")
def unsubscribe(token: str, session: CurrentSession) -> HTMLResponse:
    ids = read_token(token)
    if ids is None:
        return _page("invalid", status_code=404)
    user_id, list_id = ids
    lst = session.get(List, list_id)
    # A deleted list sends nothing more, so there is nothing to record.
    if lst is not None:
        opt_out(session, user_id, list_id)
    return _page("done", lst)
