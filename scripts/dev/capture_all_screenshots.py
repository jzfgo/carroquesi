import os
import sys
import time
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, auth
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# Load dev-scripts environment
env_path = Path("/Users/javi/Projects/personal/carroquesi/.env.dev-scripts")
load_dotenv(env_path)

FIREBASE_ADMIN_KEY_PATH = os.environ["FIREBASE_ADMIN_KEY_PATH"]
FIREBASE_API_KEY = os.environ["FIREBASE_API_KEY"]
DEV_USER_UID = os.environ["DEV_USER_UID"]
APP_BASE_URL = os.environ["APP_BASE_URL"]

# Setup screenshots directory in artifacts
screenshots_dir = Path("/Users/javi/.gemini/antigravity-cli/brain/9e5a8878-ff99-4822-a7b7-17fa0677266a/screenshots")
screenshots_dir.mkdir(parents=True, exist_ok=True)

# Generate custom token
if not firebase_admin._apps:
    cred = credentials.Certificate(Path(FIREBASE_ADMIN_KEY_PATH).expanduser())
    firebase_admin.initialize_app(cred)

custom_token = auth.create_custom_token(DEV_USER_UID).decode("utf-8")
print(f"Generated Custom Token: {custom_token[:30]}...")

def get_screenshot_path(name: str) -> str:
    return str(screenshots_dir / name)

def close_any_open_sheets(page):
    # Try pressing Escape (closes due suggestions, item action sheet, store edit, etc.)
    page.keyboard.press("Escape")
    time.sleep(0.2)
    
    # Try clicking specific cancel / close buttons if visible
    for selector in [
        ".lps__cancel",
        ".bss__cancel",
        ".due-suggestions-sheet__overlay",
        ".list-members-sheet__overlay",
        ".receipt-source-picker__cancel",
        ".sheet-close-btn",
    ]:
        btn = page.locator(selector).first
        if btn.is_visible():
            btn.click(force=True)
            time.sleep(0.5)
            
    # Try clicking sheet-overlay from top-most (last in DOM) to bottom-most (first in DOM)
    for _ in range(3):
        overlay = page.locator(".sheet-overlay").last
        if overlay.is_visible():
            overlay.click(position={"x": 10, "y": 10}, force=True)
            time.sleep(0.5)
    time.sleep(1.0)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    # iPhone 13 device settings, high scale factor for beautiful crisp shots
    device = p.devices["iPhone 13"]
    device["device_scale_factor"] = 3.0
    context = browser.new_context(**device)
    page = context.new_page()
    page.on("request", lambda request: print(f">> Request: {request.method} {request.url}"))
    page.on("response", lambda response: print(f"<< Response: {response.status} {response.url}"))

    # Define API routing/interception rules
    
    # 1. Barcode Mock Lookup
    page.route("**/barcode/8410006001224", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        json={
            "ean": "8410006001224",
            "name": "Cola Cao Original",
            "brand": "Cola Cao",
            "stores": ["Mercadona", "Ahorramas"],
            "community_price": 3.49,
            "community_price_per": "KILOGRAM"
        }
    ))

    # 2. Gemini Parse Mock Call
    def handle_gemini(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            json={
                "candidates": [{
                    "content": {
                        "parts": [{
                            "text": '{\n  "store": "Mercadona",\n  "receipt_date": "2026-06-01",\n  "receipt_total": 12.5,\n  "lines": [\n    {\n      "name": "Cola Cao Original",\n      "price_type": "UNIT",\n      "unit_price": 3.49,\n      "line_total": 3.49\n    },\n    {\n      "name": "Suavizante aroma talco",\n      "price_type": "UNIT",\n      "unit_price": 1.8,\n      "line_total": 1.8\n    }\n  ]\n}'
                        }]
                    }
                }]
            }
        )
    page.route("**/firebasevertexai.googleapis.com/**", handle_gemini)
    page.route("**/firebaseml.googleapis.com/**", handle_gemini)
    page.route("**/firebaselogic.googleapis.com/**", handle_gemini)
    page.route("**/generativelanguage.googleapis.com/**", handle_gemini)

    # 3. Backend Match Receipt Mock Response
    page.route("**/lists/*/receipt", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        json={
            "scan_id": "mock-scan-123",
            "store": "Mercadona",
            "receipt_date": "2026-06-01",
            "receipt_total": 12.50,
            "matched": [
                {
                    "receipt_name": "Suavizante aroma talco",
                    "item_id": "5c48d137-4a46-4438-9971-7e30139e213f",
                    "item_name": "Suavizante aroma talco",
                    "price_type": "UNIT",
                    "unit_price": 1.80,
                    "quantity": 1,
                    "line_total": 1.80
                }
            ],
            "unmatched": [
                {
                    "receipt_name": "Cola Cao Original",
                    "price_type": "UNIT",
                    "unit_price": 3.49,
                    "quantity": 1,
                    "line_total": 3.49
                }
            ]
        }
    ))

    # 4. Invite Details Mock Response
    page.route("**/invites/mock-invite-456", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        json={
            "id": "mock-invite-456",
            "list_name": "Majuelo",
            "list_emoji": "🏠",
            "invited_by_name": "Javier Zapata"
        }
    ))

    # 6. Price History Mock Response
    page.route("**/items/*/prices*", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        json={
            "entries": [
                {
                    "amount": 1.80,
                    "price_per": None,
                    "store": "Mercadona",
                    "purchased_at": "2026-06-01T08:00:00Z"
                },
                {
                    "amount": 1.75,
                    "price_per": None,
                    "store": "Mercadona",
                    "purchased_at": "2026-05-25T08:00:00Z"
                },
                {
                    "amount": 1.95,
                    "price_per": None,
                    "store": "Carrefour",
                    "purchased_at": "2026-05-28T08:00:00Z"
                }
            ],
            "community_price": 1.85,
            "community_price_per": None
        }
    ))

    # 5. Due Suggestions Mock Response
    page.route("**/lists/*/due-suggestions", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        json=[
            {'name': 'Tortitas de legumbres', 'brand': None, 'stores': [], 'days_overdue': 6.75, 'dismissal_ttl_days': 2.33, 'median_interval_days': 15.1, 'days_since_last': 20.3, 'avg_quantity': None},
            {'name': 'Brioche hamburguesa', 'brand': None, 'stores': ['Clan Obrador'], 'days_overdue': 2.94, 'dismissal_ttl_days': 5.5, 'median_interval_days': 14.0, 'days_since_last': 15.6, 'avg_quantity': 3},
            {'name': 'Leche entera', 'brand': 'Lauki', 'stores': ['Ahorramas'], 'days_overdue': 1.98, 'dismissal_ttl_days': 1.04, 'median_interval_days': 5.0, 'days_since_last': 6.5, 'avg_quantity': 3}
        ]
    ))

    # 1. LANDING PAGE
    print("Step 1: Capturing Landing Page...")
    page.goto(APP_BASE_URL)
    page.wait_for_selector(".signin")
    time.sleep(2)
    page.screenshot(path=get_screenshot_path("01_landing.png"))
    print("Saved: 01_landing.png")

    # 2. AUTHENTICATION & DASHBOARD
    print("Step 2: Authenticating...")
    page.evaluate(f"""
        async (token) => {{
            const loadScript = (src) => new Promise((resolve, reject) => {{
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            }});

            await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
            await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js');

            const firebaseConfig = {{
                apiKey: "{FIREBASE_API_KEY}",
                authDomain: "carroquesi.firebaseapp.com",
                projectId: "carroquesi",
                storageBucket: "carroquesi.firebasestorage.app",
                messagingSenderId: "382391287685",
                appId: "1:382391287685:web:faf30d339c2de86c230eec"
            }};

            const app = firebase.initializeApp(firebaseConfig);
            const auth = firebase.auth(app);
            await auth.signInWithCustomToken(token);
        }}
    """, custom_token)
    
    # Wait for Auth persist
    time.sleep(3)
    
    # Reload to log in
    print("Reloading to access dashboard...")
    page.reload()
    page.wait_for_selector(".dashboard-screen")
    time.sleep(3)
    
    page.screenshot(path=get_screenshot_path("02_dashboard.png"))
    print("Saved: 02_dashboard.png")

    # 20. LIST CREATION CARD
    print("Step 20: Opening List Creation Card...")
    create_btn = page.locator(".create-list-card").first
    create_btn.click()
    time.sleep(1.0)
    create_input = page.locator(".create-list-card--expanded input").first
    create_input.fill("Compra Semanal")
    time.sleep(0.5)
    page.screenshot(path=get_screenshot_path("20_list_create_card.png"))
    print("Saved: 20_list_create_card.png")
    
    # Actually create the list!
    page.locator(".create-list-card--expanded button").click()
    time.sleep(2.0)

    # 23. LIST EMOJI PICKER
    print("Step 23: Opening List Emoji Picker Sheet...")
    emoji_btn = page.locator(".list-card:has-text('Compra Semanal')").locator(".list-card__emoji").first
    emoji_btn.click()
    page.wait_for_selector(".emoji-picker-sheet")
    time.sleep(1.5)
    page.screenshot(path=get_screenshot_path("23_list_emoji_picker.png"))
    print("Saved: 23_list_emoji_picker.png")
    
    # Click an emoji to close and apply (e.g. apple or some item)
    page.locator(".emoji-picker-sheet__item").nth(2).click()
    time.sleep(1.5)

    # 21. LIST RENAME SHEET
    print("Step 21: Opening List Rename Sheet...")
    menu_btn = page.locator(".list-card:has-text('Compra Semanal')").locator(".list-card__menu-btn").first
    menu_btn.click()
    page.wait_for_selector(".list-action-sheet")
    time.sleep(1.0)
    # Click rename button
    page.locator(".list-action-sheet__action:has-text('Renombrar')").click()
    time.sleep(1.0)
    page.screenshot(path=get_screenshot_path("21_list_rename.png"))
    print("Saved: 21_list_rename.png")
    
    # Close it using Cancelar link
    page.locator(".list-action-sheet__cancel-link").click()
    time.sleep(1.0)

    # 22. LIST DELETION SHEET
    print("Step 22: Opening List Deletion Confirm Sheet...")
    # Click delete option (danger button) - no need to open menu again since we returned to 'actions' view!
    page.locator(".list-action-sheet__action--danger").click()
    time.sleep(1.0)
    page.screenshot(path=get_screenshot_path("22_list_delete.png"))
    print("Saved: 22_list_delete.png")
    
    # Actually delete the list!
    page.locator(".list-action-sheet__confirm-btn").click()
    time.sleep(2.0)

    # 3. LIST EMPTY (RECEIPT SCAN CTA)
    print("Step 3: Navigating to list 'Majuelo'...")
    list_card = page.locator(".list-card").first
    list_card.click()
    page.wait_for_selector(".list-screen")
    time.sleep(3)
    
    # Ensure list is clean by deleting any leftover unpurchased items
    print("Cleaning leftover unpurchased items...")
    for i in range(10):
        item_menu = page.locator(".item-card:not(.item-card--purchased) .item-card__menu").first
        if item_menu.is_visible():
            text = page.locator(".item-card:not(.item-card--purchased)").first.text_content()
            clean_text = " ".join(text.split()) if text else ""
            print(f"Cleaning leftover item {i+1}: {clean_text}")
            item_menu.click()
            page.wait_for_selector(".item-action-sheet")
            time.sleep(0.5)
            delete_action = page.locator(".item-action-sheet__action--danger")
            if delete_action.is_visible():
                delete_action.click()
                time.sleep(0.5)
                confirm_delete = page.locator(".item-action-sheet__confirm-btn")
                if confirm_delete.is_visible():
                    confirm_delete.click()
                    time.sleep(1.0)
                    
    page.screenshot(path=get_screenshot_path("03_list_empty.png"))
    print("Saved: 03_list_empty.png")

    # 4. SMART INPUT PREVIEW & SIGILS
    print("Step 4: Demonstrating Smart Input sigils...")
    input_field = page.locator(".smart-input__field")
    input_field.click()
    input_field.fill("Leche entera +3 #Lauki @Ahorramas")
    time.sleep(1) # wait for preview to parse
    
    page.screenshot(path=get_screenshot_path("04_smart_input_sigils.png"))
    print("Saved: 04_smart_input_sigils.png")

    # Clear input
    clear_btn = page.locator(".smart-input__clear")
    if clear_btn.is_visible():
        clear_btn.click()
        time.sleep(0.5)

    # 5. DUE SUGGESTIONS SHEET
    print("Step 5: Opening Due Suggestions sheet...")
    # Wait asynchronously for the due suggestions button to load and render
    page.wait_for_selector(".smart-input__due-btn")
    due_btn = page.locator(".smart-input__due-btn")
    due_btn.click()
    page.wait_for_selector(".due-suggestions-sheet")
    time.sleep(1.5)
    
    page.screenshot(path=get_screenshot_path("05_due_suggestions.png"))
    print("Saved: 05_due_suggestions.png")

    # 6. ADDING A SUGGESTION
    print("Step 6: Adding a suggestion...")
    add_suggestion_btn = page.locator(".due-suggestions-sheet__add").first
    add_suggestion_btn.click()
    time.sleep(1)
    
    page.screenshot(path=get_screenshot_path("06_add_suggestion.png"))
    print("Saved: 06_add_suggestion.png")

    # Close suggestions sheet
    close_any_open_sheets(page)

    # 7. ACTIVE LIST STATE
    print("Step 7: Creating active list with multiple items...")
    input_field.click()
    input_field.fill("Brioche hamburguesa @'Clan Obrador'")
    time.sleep(0.5)
    input_field.press("Enter")
    time.sleep(2.0)
    
    # Add Suavizante to unpurchased list via smart input bar (foolproof and robust!)
    input_field.click()
    input_field.fill("Suavizante aroma talco @Mercadona")
    time.sleep(0.5)
    input_field.press("Enter")
    time.sleep(2.0)

    # Mark Brioche as purchased so we have a guaranteed purchased item for later steps!
    page.locator(".item-card:has-text('Brioche')").locator(".item-card__checkbox").first.click()
    time.sleep(1.5)

    page.screenshot(path=get_screenshot_path("07_list_active.png"))
    print("Saved: 07_list_active.png")

    # 8. FILTER BAR
    print("Step 8: Filter Bar...")
    page.screenshot(path=get_screenshot_path("08_filter_bar.png"))
    print("Saved: 08_filter_bar.png")

    # 26. FILTER BY ACTIVE STORES
    print("Step 26: Filtering by active stores...")
    mercadona_chip = page.locator(".filter-bar__chip:has-text('Mercadona')").first
    mercadona_chip.click()
    time.sleep(1.0)
    page.screenshot(path=get_screenshot_path("26_filter_active_store.png"))
    print("Saved: 26_filter_active_store.png")
    
    # Reset filter by clicking 'Todas'
    todas_chip = page.locator(".filter-bar__chip:has-text('Todas')").first
    todas_chip.click()
    time.sleep(1.0)

    # 27. FILTER BY TEXT
    print("Step 27: Filtering by text...")
    search_btn = page.locator(".filter-bar__search-btn").first
    search_btn.click()
    page.wait_for_selector(".filter-bar__input")
    time.sleep(0.5)
    page.locator(".filter-bar__input").fill("Brioche")
    time.sleep(1.0)
    page.screenshot(path=get_screenshot_path("27_filter_by_text.png"))
    print("Saved: 27_filter_by_text.png")
    
    # Close text filter
    page.locator(".filter-bar__close-btn").click()
    time.sleep(1.0)

    # 9. ITEM ACTION SHEET
    print("Step 9: Opening Item Action Sheet...")
    item_menu_btn = page.locator(".item-card:not(.item-card--purchased) .item-card__menu").first
    item_menu_btn.click()
    page.wait_for_selector(".item-action-sheet")
    time.sleep(1.5)
    
    page.screenshot(path=get_screenshot_path("09_item_action_sheet.png"))
    print("Saved: 09_item_action_sheet.png")

    # Close item action sheet
    close_any_open_sheets(page)

    # 10. PRICE HISTORY SHEET
    print("Step 10: Opening Price History sheet...")
    price_btn = page.locator(".item-card:not(.item-card--purchased):has-text('Suavizante')").locator("button[aria-label='Historial de precios']").first
    price_btn.click()
    page.wait_for_selector(".phs")
    time.sleep(1.5)
    
    page.screenshot(path=get_screenshot_path("10_price_history.png"))
    print("Saved: 10_price_history.png")

    # 28. PRICE HISTORY EXPANDED
    print("Step 28: Expanding store price history chart...")
    store_row = page.locator(".phs__store-row").first
    store_row.click()
    time.sleep(1.5)
    page.screenshot(path=get_screenshot_path("28_price_history_expanded.png"))
    print("Saved: 28_price_history_expanded.png")
    
    # Collapse it back
    store_row.click()
    time.sleep(0.5)

    # Close price history sheet
    close_any_open_sheets(page)

    # 11. LOG PRICE SHEET
    print("Step 11: Opening Log Price sheet on a purchased item...")
    # Click price tag first to open PriceHistorySheet
    purchased_price_btn = page.locator(".item-card--purchased").first.locator(".item-card__tag--price, button[aria-label='Registrar precio']").first
    purchased_price_btn.click()
    page.wait_for_selector(".phs")
    time.sleep(1.0)
    
    # Click Registrar/Actualizar button inside PriceHistorySheet to open LogPurchaseSheet (.lps)
    log_btn = page.locator(".phs__log-btn")
    log_btn.click()
    page.wait_for_selector(".lps")
    time.sleep(1.5)
    
    page.screenshot(path=get_screenshot_path("11_log_price_sheet.png"))
    print("Saved: 11_log_price_sheet.png")

    # Close log price sheet
    close_any_open_sheets(page)
    time.sleep(1.0)
    
    # Close the underlying price history sheet
    close_any_open_sheets(page)
    time.sleep(1.0)

    # 13. LIST MEMBERS SHEET
    print("Step 13: Opening List Members Sheet...")
    members_btn = page.locator(".list-header__menu")
    members_btn.click()
    page.wait_for_selector(".list-members-sheet")
    time.sleep(1.5)
    
    page.screenshot(path=get_screenshot_path("13_list_members.png"))
    print("Saved: 13_list_members.png")
    
    # Close members sheet
    close_any_open_sheets(page)

    # 25. BARCODE CAMERA SCANNER VIEW FINDER
    print("Step 25: Opening Barcode Camera Scanner view finder...")
    camera_scan_btn = page.locator(".smart-input__scan").first
    camera_scan_btn.click()
    page.wait_for_selector(".barcode-scanner")
    time.sleep(2.0)
    page.screenshot(path=get_screenshot_path("25_barcode_camera_scanner.png"))
    print("Saved: 25_barcode_camera_scanner.png")
    
    # Close camera scanner
    page.locator("button[aria-label='Cerrar escáner']").first.click()
    time.sleep(1.0)

    # 14. BARCODE SCAN SHEET (via EAN search mock)
    print("Step 14: Opening Barcode Scan Sheet...")
    input_field.click()
    input_field.fill("|8410006001224")
    time.sleep(1) # wait for EAN mode to render
    
    page.wait_for_selector(".smart-input__buscar")
    buscar_btn = page.locator(".smart-input__buscar")
    buscar_btn.click()
    page.wait_for_selector(".bss")
    time.sleep(2)
    
    page.screenshot(path=get_screenshot_path("14_barcode_scan_sheet.png"))
    print("Saved: 14_barcode_scan_sheet.png")
    
    # Close barcode scan sheet
    close_any_open_sheets(page)
    
    # Clear input
    if clear_btn.is_visible():
        clear_btn.click()
        time.sleep(0.5)

    # 17. STORE EDIT SHEET
    print("Step 17: Opening Store Edit Sheet...")
    store_tag = page.locator(".item-card:has-text('Tortitas de legumbres')").locator("text=/\\+ 🏪/i")
    if store_tag.is_visible():
        store_tag.click()
        page.wait_for_selector(".store-edit-sheet")
        time.sleep(1.5)
        page.screenshot(path=get_screenshot_path("17_store_edit_sheet.png"))
        print("Saved: 17_store_edit_sheet.png")
        close_any_open_sheets(page)

    # 18. TAG EDIT SHEET
    print("Step 18: Opening Tag Edit Sheet...")
    tag_btn = page.locator(".item-card:has-text('Tortitas de legumbres')").locator("text=/\\+ 🏷️/i")
    if tag_btn.is_visible():
        tag_btn.click()
        page.wait_for_selector(".tag-edit-sheet")
        time.sleep(1.5)
        page.screenshot(path=get_screenshot_path("18_tag_edit_sheet.png"))
        print("Saved: 18_tag_edit_sheet.png")
        close_any_open_sheets(page)

    # 15. RECEIPT SOURCE PICKER POPUP
    print("Step 15: Opening Receipt Source Picker...")
    print("Deleting active items to show receipt CTA...")
    for i in range(8):
        item_menu = page.locator(".item-card:not(.item-card--purchased) .item-card__menu").first
        if item_menu.is_visible():
            text = page.locator(".item-card:not(.item-card--purchased)").first.text_content()
            clean_text = " ".join(text.split()) if text else ""
            print(f"Deleting item {i+1}: {clean_text}")
            item_menu.click()
            page.wait_for_selector(".item-action-sheet")
            time.sleep(0.5)
            delete_action = page.locator(".item-action-sheet__action--danger")
            if delete_action.is_visible():
                delete_action.click()
                time.sleep(0.5)
                confirm_delete = page.locator(".item-action-sheet__confirm-btn")
                if confirm_delete.is_visible():
                    confirm_delete.click()
                    time.sleep(1.0)
                    
    remaining_count = page.locator(".item-card:not(.item-card--purchased)").count()
    print(f"Remaining unpurchased items count: {remaining_count}")
    if remaining_count > 0:
        for i in range(remaining_count):
            item_text = page.locator(".item-card:not(.item-card--purchased)").nth(i).text_content()
            clean_item_text = " ".join(item_text.split()) if item_text else ""
            print(f"Remaining {i+1}: {clean_item_text}")


    # Now active items are gone! The receipt scan CTA is visible!
    scan_cta = page.locator(".receipt-scan-cta__btn")
    if scan_cta.is_visible():
        scan_cta.click()
        page.wait_for_selector(".receipt-source-picker")
        time.sleep(1.5)
        
        page.screenshot(path=get_screenshot_path("15_receipt_source_picker.png"))
        print("Saved: 15_receipt_source_picker.png")
        
        # 16. RECEIPT SCAN SHEET (via fake file upload mock)
        print("Step 16: Triggering Receipt Scan Sheet...")
        file_input = page.locator("input[type='file']").first
        file_input.set_input_files([
            {
                "name": "receipt.png",
                "mimeType": "image/png",
                "buffer": b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
            }
        ])
        page.wait_for_selector(".rss-row")
        time.sleep(3.0)
        
        page.screenshot(path=get_screenshot_path("16_receipt_scan_sheet.png"))
        print("Saved: 16_receipt_scan_sheet.png")
        
        # Close receipt scan sheet
        close_any_open_sheets(page)

    # 12. USER SETTINGS / AVATAR MENU (on Dashboard)
    print("Step 12: Opening Avatar Menu...")
    back_btn = page.locator(".list-header__back")
    if back_btn.is_visible():
        back_btn.click()
        page.wait_for_selector(".dashboard-screen")
        time.sleep(2)
        
    avatar_btn = page.locator(".dashboard-screen__avatar")
    avatar_btn.click()
    page.wait_for_selector(".dashboard-screen__avatar-menu")
    time.sleep(1.0)
    
    page.screenshot(path=get_screenshot_path("12_theme_settings.png"))
    print("Saved: 12_theme_settings.png")

    # 24. FEEDBACK SHEET
    print("Step 24: Opening Feedback sheet...")
    feedback_menu_btn = page.locator(".dashboard-screen__avatar-menu-item:has-text('Enviar feedback')").first
    feedback_menu_btn.click()
    page.wait_for_selector(".feedback-sheet")
    time.sleep(1.0)
    
    # Fill in dummy details to look premium and authentic!
    page.locator(".feedback-sheet textarea").fill("¡Me encanta la aplicación! El escaneo de tickets con IA me ahorra muchísimo tiempo y funciona de maravilla. 🚀")
    page.locator(".feedback-sheet input[type='email']").fill("javier@zapata.com")
    time.sleep(1.0)
    page.screenshot(path=get_screenshot_path("24_feedback_sheet.png"))
    print("Saved: 24_feedback_sheet.png")
    
    # Close feedback sheet
    page.locator(".feedback-sheet__secondary").click()
    time.sleep(1.0)

    # 19. INVITE PREVIEW SCREEN
    print("Step 19: Opening Invite Preview Screen...")
    page.goto(APP_BASE_URL + "/invite/mock-invite-456")
    page.wait_for_selector(".invite-screen")
    time.sleep(3.0)
    
    page.screenshot(path=get_screenshot_path("19_invite_preview.png"))
    print("Saved: 19_invite_preview.png")

    print("Closing browser...")
    browser.close()

print("All advanced screenshots successfully captured!")
