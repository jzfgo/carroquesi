#!/usr/bin/env python3
"""
Grant admin status to a Firebase user via custom claims.

Usage:
    uv run python scripts/set_admin.py <firebase_uid>

The user must refresh their Firebase ID token before the claim takes effect.
Firebase caches tokens for up to 1 hour.
"""

import sys
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials

cred = credentials.Certificate(Path(__file__).parent.parent / "firebase-credentials.json")
firebase_admin.initialize_app(cred)

uid = sys.argv[1]
auth.set_custom_user_claims(uid, {"is_admin": True})
print(f"Set is_admin=True for uid={uid!r}")
print("User must refresh their Firebase token (wait up to 1 hour, or force-refresh in the app).")
