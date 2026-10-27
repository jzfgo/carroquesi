"""Accent- and case-blind text folding for item names and brands."""

import re
import unicodedata


def fold_name(text: str) -> str:
    """Fold text for comparison: lowercase, strip accents (NFD, drop
    combining marks), collapse whitespace runs, trim.

    Callers compare folded text exactly, by prefix, or by substring — never
    fuzzily. Fuzzy matching silently declares two different products the
    same, the reason store auto-merge was rejected (ADR-013). So "pimenton"
    finds "Pimentón" but "pimento" does not equal it. Distinct from
    receipt_matcher.normalise, which also strips a leading quantity because
    receipt lines carry one; item names don't. The frontend mirrors the
    case and accent part in lib/foldText.ts.
    """
    text = text.lower()
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text).strip()
