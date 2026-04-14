import html as _html
import json as _json

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from sqlmodel import select

from app.db.models import ListInvite, List, User
from app.dependencies import CurrentSession

router = APIRouter(tags=["share"])


@router.get("/i/{invite_id}", response_class=HTMLResponse, include_in_schema=False)
def invite_share_page(invite_id: str, session: CurrentSession):
    """
    Returns an HTML page with Open Graph meta tags for social sharing previews
    (WhatsApp, Telegram, etc.). Crawlers read the OG tags; real browsers are
    immediately redirected to the SPA invite page via meta refresh.
    """
    invite = session.get(ListInvite, invite_id)
    if invite is not None:
        lst = session.get(List, invite.list_id)
        inviter = session.get(User, invite.invited_by)
        list_name = lst.name if lst else "una lista"
        list_emoji = lst.emoji if lst else None
        inviter_name = inviter.display_name if inviter else None
    else:
        list_name = "una lista"
        list_emoji = None
        inviter_name = None

    emoji_prefix = f"{list_emoji} " if list_emoji else ""
    title = _html.escape(f"{emoji_prefix}{list_name} — CarroQueSí")
    description = _html.escape(
        f"{inviter_name} te invitó a unirse a '{list_name}' en CarroQueSí"
        if inviter_name
        else f"Te invitaron a unirse a '{list_name}' en CarroQueSí"
    )
    # HTML-escaped for use in attributes / meta tags
    redirect_url_html = _html.escape(f"/invite/{invite_id}")
    # JS-escaped for use inside a <script> string literal — html.escape() is
    # NOT appropriate here because HTML entities are not decoded inside <script>.
    redirect_url_js = _json.dumps(f"/invite/{invite_id}").replace("<", "\\u003c").replace(">", "\\u003e")

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{description}" />
  <meta http-equiv="refresh" content="0;url={redirect_url_html}" />
</head>
<body>
  <script>window.location.replace({redirect_url_js});</script>
</body>
</html>"""

    return HTMLResponse(content=html)
