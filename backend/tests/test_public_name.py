from app.services.public_name import public_name


def test_the_display_name_wins():
    assert public_name("Alice", "alice@example.com") == "Alice"


def test_without_a_display_name_only_the_local_part_shows():
    # Other members see this name; the full address is not theirs to see.
    assert public_name(None, "alice@example.com") == "alice"
    assert public_name("", "alice@example.com") == "alice"
