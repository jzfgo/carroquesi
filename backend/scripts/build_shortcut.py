"""Build the CarroQueSí Siri Shortcut served by GET /shortcuts/cqs.shortcut.

The shortcut is a single "add item by voice" flow:

    1. Text        — empty; the user pastes their API key here after importing.
    2. Ask          — Siri prompts "¿Qué quieres añadir a la lista?".
    3. Get contents — POST {"name": <ask output>} to /lists/default/items,
                      authenticated with the pasted key via the X-Api-Key header.
    4. Notification — "Añadido a CarroQueSí ✅".

The "default" list id is resolved server-side to the caller's most-recently-updated
list (see require_member_or_default in app/dependencies.py), so this one static,
pre-signed binary works for every user without knowing a real list id ahead of time.

Both magic-variable bindings (the JSON body's `name` and the `X-Api-Key` header) use
the object-replacement char (\\uFFFC) plus an ActionOutput back-reference — the same
mechanism whether the value lands in a header or a JSON body.

Usage
-----
    # 1. Generate the unsigned plist (override the URL for a non-prod backend):
    python backend/scripts/build_shortcut.py [--base-url URL] [--out PATH]

    # 2. Sign it on macOS (iCloud-notarised so it imports without a warning):
    shortcuts sign --mode anyone --input cqs_unsigned.shortcut \\
        --output backend/app/static/cqs.shortcut

Signing requires macOS and a signed-in iCloud account; it cannot run in CI. Commit
the signed backend/app/static/cqs.shortcut so the Cloud Run image can serve it.
"""

import argparse
import plistlib
import uuid
from pathlib import Path

PROD_BASE_URL = "https://carroquesi-backend-382391287685.europe-west1.run.app"
OBJ = "￼"  # object-replacement char a magic-variable attachment binds to


def _magic(output_uuid: str, output_name: str) -> dict:
    """A text token whose value is another action's output (a "magic variable")."""
    return {
        "Value": {
            "string": OBJ,
            "attachmentsByRange": {
                "{0, 1}": {
                    "Type": "ActionOutput",
                    "OutputUUID": output_uuid,
                    "OutputName": output_name,
                }
            },
        },
        "WFSerializationType": "WFTextTokenString",
    }


def _plain(text: str) -> dict:
    return {
        "Value": {"string": text, "attachmentsByRange": {}},
        "WFSerializationType": "WFTextTokenString",
    }


def build_workflow(base_url: str) -> dict:
    key_uuid = str(uuid.uuid4()).upper()
    ask_uuid = str(uuid.uuid4()).upper()

    key_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {"UUID": key_uuid, "WFTextActionText": ""},
    }
    ask_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
        "WFWorkflowActionParameters": {
            "UUID": ask_uuid,
            "WFInputType": "Text",
            "WFAskActionPrompt": "¿Qué quieres añadir a la lista?",
        },
    }
    post_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "WFURL": f"{base_url}/lists/default/items",
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFJSONValues": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        {
                            "WFItemType": 0,
                            "WFKey": _plain("name"),
                            "WFValue": _magic(ask_uuid, "Provided Input"),
                        }
                    ]
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
            "WFHTTPHeaders": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        {
                            "WFItemType": 0,
                            "WFKey": _plain("X-Api-Key"),
                            "WFValue": _magic(key_uuid, "Text"),
                        }
                    ]
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
        },
    }
    notify_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
        "WFWorkflowActionParameters": {"WFNotificationActionBody": "Añadido a CarroQueSí ✅"},
    }

    return {
        "WFWorkflowClientVersion": "2607.0.2.3",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 4282601983,
            "WFWorkflowIconGlyphNumber": 61440,
        },
        "WFWorkflowImportQuestions": [],
        "WFWorkflowTypes": [],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFURLContentItem"],
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowActions": [key_action, ask_action, post_action, notify_action],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=PROD_BASE_URL, help="backend base URL")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("cqs_unsigned.shortcut"),
        help="output path for the unsigned plist",
    )
    args = parser.parse_args()

    with args.out.open("wb") as f:
        plistlib.dump(build_workflow(args.base_url), f)
    print(f"wrote {args.out} (base URL: {args.base_url})")
    print("sign it with:")
    print(
        f"  shortcuts sign --mode anyone --input {args.out} "
        "--output backend/app/static/cqs.shortcut"
    )


if __name__ == "__main__":
    main()
