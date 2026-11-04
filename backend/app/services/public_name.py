"""The name other members see for a user."""


def public_name(display_name: str | None, email: str) -> str:
    """The display name, or the email's local part when there is none.

    Other members see this name, so the full address never stands in for it.
    """
    return display_name or email.split("@")[0]
