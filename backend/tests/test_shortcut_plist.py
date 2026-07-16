import plistlib

from app.services.shortcut_plist import build_shortcut_plist


def test_produces_valid_binary_plist():
    data = build_shortcut_plist(
        api_base="https://api.carroquesi.app",
        api_key="cqs_testkey",
        default_list_id="list-123",
    )
    assert data.startswith(b"bplist00")
    workflow = plistlib.loads(data)
    assert len(workflow["WFWorkflowActions"]) > 0


def test_embeds_api_key_in_url_action_headers():
    data = build_shortcut_plist(
        api_base="https://api.carroquesi.app",
        api_key="cqs_secret123",
        default_list_id="list-123",
    )
    workflow = plistlib.loads(data)
    url_actions = [
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"
    ]
    assert len(url_actions) > 0
    for action in url_actions:
        items = action["WFWorkflowActionParameters"]["WFHTTPHeaders"]["Value"][
            "WFDictionaryFieldValueItems"
        ]
        header_values = {
            item["WFKey"]["Value"]["string"]: item["WFValue"]["Value"]["string"] for item in items
        }
        assert header_values["X-Api-Key"] == "cqs_secret123"


def test_embeds_default_list_id_in_all_urls():
    data = build_shortcut_plist(
        api_base="https://api.carroquesi.app",
        api_key="cqs_testkey",
        default_list_id="list-abc",
    )
    workflow = plistlib.loads(data)
    url_actions = [
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"
    ]
    assert len(url_actions) > 0
    for action in url_actions:
        assert "list-abc" in action["WFWorkflowActionParameters"]["WFURL"]


def test_add_item_action_posts_with_json_body():
    data = build_shortcut_plist(
        api_base="https://api.carroquesi.app",
        api_key="cqs_testkey",
        default_list_id="list-abc",
    )
    workflow = plistlib.loads(data)
    post_actions = [
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl"
        and a["WFWorkflowActionParameters"].get("WFHTTPMethod") == "POST"
    ]
    assert len(post_actions) == 1
    assert post_actions[0]["WFWorkflowActionParameters"]["WFHTTPBodyType"] == "JSON"


def test_menu_group_has_matching_grouping_identifier_and_boundaries():
    data = build_shortcut_plist(
        api_base="https://api.carroquesi.app",
        api_key="cqs_testkey",
        default_list_id="list-abc",
    )
    workflow = plistlib.loads(data)
    menu_actions = [
        a
        for a in workflow["WFWorkflowActions"]
        if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.choosefrommenu"
    ]
    group_ids = {a["WFWorkflowActionParameters"]["GroupingIdentifier"] for a in menu_actions}
    assert len(group_ids) == 1

    modes = [a["WFWorkflowActionParameters"]["WFControlFlowMode"] for a in menu_actions]
    assert modes[0] == 0  # group start
    assert modes[-1] == 2  # group end
    assert modes.count(1) == 4  # one case-boundary per menu item (4 actions)
