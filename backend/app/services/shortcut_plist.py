"""Builds a CarroQueSí Siri Shortcut as a binary WFWorkflow plist.

This is unsigned — see docs/superpowers/specs/2026-07-16-siri-shortcuts-design.md
for why genuine Apple code-signing isn't available to third-party servers.

Structural shape (action identifiers, header/body wiring, menu grouping) is
covered by tests in test_shortcut_plist.py. Magic-variable wiring between
actions (e.g. piping a fetched item's id into the mark-purchased request)
uses Shortcuts' internal UUID-based variable references, which aren't
practical to hand-author correctly without live device testing — this is
expected to need a manual pass in the Shortcuts app editor during the
device QA step (see the design spec's Testing section). Don't treat that
gap as a bug in this module.
"""

import plistlib
import uuid
from typing import Any


def _headers_param(headers: dict[str, str]) -> dict[str, Any]:
    return {
        "Value": {
            "WFDictionaryFieldValueItems": [
                {
                    "WFItemType": 0,
                    "WFKey": {
                        "Value": {"string": key},
                        "WFSerializationType": "WFTextTokenString",
                    },
                    "WFValue": {
                        "Value": {"string": value},
                        "WFSerializationType": "WFTextTokenString",
                    },
                }
                for key, value in headers.items()
            ]
        },
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def _url_action(
    url: str,
    method: str,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "WFURL": url,
        "WFHTTPMethod": method,
        "WFHTTPHeaders": _headers_param(headers),
    }
    if body is not None:
        params["WFHTTPBodyType"] = "JSON"
        params["WFJSONValues"] = body
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": params,
    }


def _ask_for_input_action(prompt: str) -> dict[str, Any]:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
        "WFWorkflowActionParameters": {"WFAskActionPrompt": prompt, "WFInputType": "Text"},
    }


def _show_result_action() -> dict[str, Any]:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.showresult",
        "WFWorkflowActionParameters": {},
    }


def _choose_from_list_action(prompt: str) -> dict[str, Any]:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.choosefromlist",
        "WFWorkflowActionParameters": {"WFChooseFromListActionPrompt": prompt},
    }


def _menu_group(prompt: str, cases: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    group_id = str(uuid.uuid4())
    actions: list[dict[str, Any]] = [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefrommenu",
            "WFWorkflowActionParameters": {
                "WFControlFlowMode": 0,
                "GroupingIdentifier": group_id,
                "WFMenuPrompt": prompt,
                "WFMenuItems": list(cases.keys()),
            },
        }
    ]
    for case_name, case_actions in cases.items():
        actions.append(
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions.choosefrommenu",
                "WFWorkflowActionParameters": {
                    "WFControlFlowMode": 1,
                    "GroupingIdentifier": group_id,
                    "WFMenuItemTitle": case_name,
                },
            }
        )
        actions.extend(case_actions)
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefrommenu",
            "WFWorkflowActionParameters": {
                "WFControlFlowMode": 2,
                "GroupingIdentifier": group_id,
            },
        }
    )
    return actions


def build_shortcut_plist(*, api_base: str, api_key: str, default_list_id: str) -> bytes:
    headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}
    items_url = f"{api_base}/lists/{default_list_id}/items"
    due_url = f"{api_base}/lists/{default_list_id}/due-suggestions"

    actions: list[dict[str, Any]] = _menu_group(
        "¿Qué quieres hacer?",
        {
            "Añadir artículo": [
                _ask_for_input_action("¿Qué quieres añadir?"),
                _url_action(items_url, "POST", headers, body={"name": "Ask for Input"}),
                _show_result_action(),
            ],
            "Ver lista": [
                _url_action(items_url, "GET", headers),
                _show_result_action(),
            ],
            "Marcar como comprado": [
                _url_action(items_url, "GET", headers),
                _choose_from_list_action("¿Qué artículo compraste?"),
                _url_action(f"{items_url}/", "PATCH", headers, body={"purchased": True}),
                _show_result_action(),
            ],
            "Ver sugerencias": [
                _url_action(due_url, "GET", headers),
                _show_result_action(),
            ],
        },
    )

    workflow: dict[str, Any] = {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "1400",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 4292093695,
            "WFWorkflowIconGlyphNumber": 61440,
        },
        "WFWorkflowTypes": ["NCWidget", "WatchKit"],
        "WFWorkflowInputContentItemClasses": [],
    }
    return plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY)
