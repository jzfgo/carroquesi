"""
Generates a valid Firebase ID token for DEV_USER_UID.

Usage:
    TOKEN=$(python scripts/dev/get_token.py)
    curl -H "Authorization: Bearer $TOKEN" $API_BASE_URL/endpoint

Requires: .env.dev-scripts at the repo root
"""

import os
import sys
from pathlib import Path
import requests
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, auth

env_path = Path(__file__).resolve().parents[2] / ".env.dev-scripts"
if not env_path.exists():
    print(f"ERROR: {env_path} not found", file=sys.stderr)
    print("Copy .env.dev-scripts.example to .env.dev-scripts and fill in the values.", file=sys.stderr)
    sys.exit(1)

load_dotenv(env_path)

FIREBASE_ADMIN_KEY_PATH = os.environ["FIREBASE_ADMIN_KEY_PATH"]
FIREBASE_API_KEY = os.environ["FIREBASE_API_KEY"]
DEV_USER_UID = os.environ["DEV_USER_UID"]

if not firebase_admin._apps:
    cred = credentials.Certificate(Path(FIREBASE_ADMIN_KEY_PATH).expanduser())
    firebase_admin.initialize_app(cred)

custom_token = auth.create_custom_token(DEV_USER_UID).decode("utf-8")

resp = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={FIREBASE_API_KEY}",
    json={"token": custom_token, "returnSecureToken": True},
)
resp.raise_for_status()

print(resp.json()["idToken"])
