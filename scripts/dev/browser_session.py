"""
Headless Playwright with an authenticated Firebase session.

Usage (Claude Code calls this directly):
    python scripts/dev/browser_session.py screenshot <url> <output.png>
    python scripts/dev/browser_session.py dump <url>

The script fetches a fresh token via get_token.py and injects the cookies/localStorage
entries needed for Firebase Auth to recognise the session.

Requires: .env.dev-scripts + playwright installed (see README)
"""

import subprocess
import sys
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv
import os

env_path = Path(__file__).resolve().parents[2] / ".env.dev-scripts"
load_dotenv(env_path)
APP_BASE_URL = os.environ["APP_BASE_URL"]


def get_fresh_token() -> str:
    result = subprocess.run(
        [sys.executable, str(Path(__file__).parent / "get_token.py")],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def inject_auth(page, id_token: str):
    """Injects the ID token into localStorage for Firebase Auth to pick up."""
    page.evaluate(f"""
        () => {{
            // Firebase stores the session in localStorage under a dynamic key.
            // We write a fallback entry that the app can detect on startup.
            localStorage.setItem('dev_id_token', '{id_token}');
        }}
    """)


def run(args):
    command = args[0]
    id_token = get_fresh_token()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        # Navigate to the app root and inject auth before the app boots
        page.goto(APP_BASE_URL)
        inject_auth(page, id_token)
        page.reload()  # Reload so Firebase processes the injected token

        if command == "screenshot":
            url, output = args[1], args[2]
            page.goto(url)
            page.wait_for_load_state("networkidle")
            page.screenshot(path=output, full_page=True)
            print(f"Screenshot saved: {output}")

        elif command == "dump":
            url = args[1]
            page.goto(url)
            page.wait_for_load_state("networkidle")
            print(page.content())

        else:
            print(f"Unknown command: {command}", file=sys.stderr)
            sys.exit(1)

        browser.close()


if __name__ == "__main__":
    run(sys.argv[1:])
