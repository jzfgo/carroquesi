"""The unsubscribe link in the monthly report.

GET only shows a page with a button: link scanners and mail previews open
links on their own, and must not unsubscribe anyone. POST does it, from
that button or from a mail client's one-click unsubscribe (RFC 8058).
Served on the frontend's domain through a Hosting rewrite of /u/**.
"""

import html

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.db.models import List
from app.dependencies import CurrentSession
from app.services.report_opt_out import opt_out, read_token

router = APIRouter(prefix="/u", include_in_schema=False)


def _page(body: str, status_code: int = 200) -> HTMLResponse:
    return HTMLResponse(
        f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Informe mensual — CarroQueSí</title>
</head>
<body style="margin:0;padding:48px 16px;font-family:Georgia,serif;color:#222;background:#fff;">
  <div style="max-width:480px;margin:0 auto;">{body}</div>
</body>
</html>""",
        status_code=status_code,
    )


def _invalid() -> HTMLResponse:
    return _page("<p>Este enlace no es válido.</p>", status_code=404)


def _list_name(lst: List | None) -> str:
    return html.escape(lst.name) if lst else "esta lista"


@router.get("/{token}")
def confirm_page(token: str, session: CurrentSession) -> HTMLResponse:
    ids = read_token(token)
    if ids is None:
        return _invalid()
    name = _list_name(session.get(List, ids[1]))
    return _page(
        f"""<p>¿Dejar de recibir el informe mensual de «{name}»?</p>
<form method="post">
  <button type="submit" style="font:inherit;padding:8px 16px;">Dejar de recibirlo</button>
</form>"""
    )


@router.post("/{token}")
def unsubscribe(token: str, session: CurrentSession) -> HTMLResponse:
    ids = read_token(token)
    if ids is None:
        return _invalid()
    user_id, list_id = ids
    lst = session.get(List, list_id)
    # A deleted list sends nothing more, so there is nothing to record.
    if lst is not None:
        opt_out(session, user_id, list_id)
    return _page(f"<p>Hecho. Ya no recibirás el informe mensual de «{_list_name(lst)}».</p>")
