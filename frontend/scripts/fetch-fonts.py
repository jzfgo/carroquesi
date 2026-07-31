#!/usr/bin/env python3
"""Vendor the app's web fonts from Google Fonts.

Writes `src/assets/fonts/*.woff2` and `src/fonts.css`, replacing whatever is
there. Run it from `frontend/`, or through `just frontend fetch-fonts`.

WHY THIS IS A SCRIPT AND NOT A ONE-OFF PASTE. The @font-face blocks below are
Google's, copied through unedited except for the `src:` URL. Hand-authoring
them is the tempting shortcut and it is the one thing that must not happen:
three of these five families are served as *variable* fonts, so Google emits
one block per requested weight all pointing at the same file, and a hand-written
`font-weight: 400 700` range in place of those blocks changes which instance the
browser picks. `unicode-range` has the same property — drop it and every subset
file is downloaded on every page. Copying verbatim reproduces the CDN's own
selection behaviour exactly, and a re-run reproduces this commit.

WHAT A RE-RUN IS FOR. Google re-cuts families and bumps the version directory in
the URL (`geist/v5`, `caveat/v23`, …) when it does. Until this script existed
that happened silently and took every visual-regression baseline with it, with
no commit to blame — see `tests/README.md`. Now a refresh is a diff: run this,
and if any `.woff2` changes, the letterforms changed, and the baselines have to
be regenerated in the same commit.

WHY ONLY SOME SUBSETS. Google splits each family by `unicode-range` and serves
one file per script. `SUBSETS` below keeps `latin` and `latin-ext` and drops
cyrillic, cyrillic-ext, greek and vietnamese — 10 files and 180 KB of glyphs for
alphabets a Spanish grocery list does not write in. It is not free: an item
*named* in Cyrillic used to render in Geist and now falls back to the system
face. That is the trade, it is reversible by editing one line here, and it is
worth naming because nothing else in the app will tell you.

Note `≈` (U+2248) — drawn beside a converted price in `PriceHistoryBlock` and in
`LogPurchaseSheet` — is outside *every* subset Google serves, `latin` included.
It already came from a system font and still does. Dropping subsets does not
touch it.

The emitted CSS is run through stylelint and Prettier at the end. No value
changes — it is purely how the file is laid out — but the step lives here
rather than in the `just` recipe so that a bare `python3 scripts/fetch-fonts.py`
cannot leave behind a file that fails `just ci`.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

# The families and weights the app asks for. Keep in step with the tokens in
# `src/colorsAndType.css` — a weight used there but missing here renders as a
# synthesised bold, which looks nearly right and is not.
FONTS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Geist:wght@400;500;600;700"
    "&family=Bree+Serif"
    "&family=Caveat:wght@500;600;700"
    "&family=Patrick+Hand+SC"
    "&family=JetBrains+Mono:wght@400;500;600"
    "&display=swap"
)

# Google serves woff2 only to a UA it recognises as supporting it; ask as
# anything older and it answers with ttf, which is roughly twice the bytes.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

SUBSETS = ("latin", "latin-ext")

FONT_DIR = Path("src/assets/fonts")
CSS_OUT = Path("src/fonts.css")

# One @font-face, with the `/* subset */` comment Google puts above it.
BLOCK_RE = re.compile(r"/\* (?P<subset>[\w-]+) \*/\s*(?P<block>@font-face \{.*?\})", re.S)
FAMILY_RE = re.compile(r"font-family: '(?P<family>[^']*)'")
SRC_RE = re.compile(r"url\((?P<url>https://fonts\.gstatic\.com/[^)]*)\)")

HEADER = """/* Vendored from Google Fonts by `scripts/fetch-fonts.py` — do not edit.
   To change a family, a weight or a subset, edit that script and re-run it:
   `just frontend fetch-fonts`. Every declaration below is Google's own: the
   only rewrite is the `src:` URL, which now points at `src/assets/fonts/`.
   Stylelint and Prettier then lay the file out — quotes dropped from the
   family names that do not need them, `unicode-range` rewrapped — which
   changes how it reads and not one value in it.

   Vite fingerprints these files at build time, so a refreshed cut of a family
   is served under a new name and no browser can hold a stale one. */
"""


def slug(family: str) -> str:
    return family.lower().replace(" ", "-")


def format_css(path: Path) -> bool:
    """Lay the emitted file out the way `just ci` expects to find it.

    Google's CSS is not written to this repo's house style: it quotes family
    names, which `font-family-name-quotes` rejects, and it runs the `/* subset */
    */` comments straight onto the previous rule, which `comment-empty-line-before`
    rejects. Neither changes a value — stylelint's own `--fix` resolves both —
    but `src/fonts.css` is in neither ignore file, so a run that skipped this
    would leave the repo one commit from a red CI job with no reason for anyone
    to suspect the font script of it. Failing here is therefore a real failure.

    stylelint first, prettier second, so the final say on layout is prettier's,
    which is the order `just ci` checks them in.
    """
    if shutil.which("pnpm") is None:
        print("pnpm not on PATH — run `just frontend fetch-fonts` instead", file=sys.stderr)
        return False
    for tool in (["stylelint", "--fix"], ["prettier", "--write"]):
        if subprocess.run(["pnpm", "exec", *tool, str(path)]).returncode != 0:
            print(f"{tool[0]} could not format {path}", file=sys.stderr)
            return False
    return True


def main() -> int:
    if not Path("package.json").exists():
        print("run me from frontend/", file=sys.stderr)
        return 1

    request = urllib.request.Request(FONTS_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request) as response:
        css = response.read().decode()

    # Downloaded beside the real directory and moved over it at the end, rather
    # than into it. The replacement has to be wholesale — a family or a subset
    # removed from the request above must disappear from the tree too, and an
    # incremental write would leave it behind, still shipped and still precached
    # — but deleting first means any failure after that point (a dropped
    # connection mid-loop, the bail below) leaves `src/assets/fonts/` empty or
    # half-filled while `src/fonts.css` still names all ten files. The build
    # breaks, and nothing on screen says the remedy is `git checkout`.
    staging = FONT_DIR.with_name(FONT_DIR.name + ".partial")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    out: list[str] = [HEADER]
    downloaded: dict[str, str] = {}

    # The staging directory must not outlive a failed run either: left behind
    # inside `src/`, it is untracked litter that the next run would have to
    # recognise as stale rather than resumable.
    try:
        for match in BLOCK_RE.finditer(css):
            subset = match.group("subset")
            if subset not in SUBSETS:
                continue
            block = match.group("block")

            family = FAMILY_RE.search(block).group("family")
            url = SRC_RE.search(block).group("url")

            # The variable families repeat one URL across every weight. Name the
            # file for what it holds, not for Google's hash, and fetch it once.
            name = downloaded.get(url)
            if name is None:
                name = f"{slug(family)}-{subset}.woff2"
                request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(request) as response:
                    (staging / name).write_bytes(response.read())
                downloaded[url] = name

            out.append(f"/* {subset} */")
            out.append(SRC_RE.sub(f"url('./assets/fonts/{name}')", block))

        if not downloaded:
            print("no @font-face blocks matched — did the CSS format change?", file=sys.stderr)
            return 1

        # Everything is on disk and the CSS names only files that exist. Swap.
        if FONT_DIR.exists():
            shutil.rmtree(FONT_DIR)
        staging.rename(FONT_DIR)
    finally:
        if staging.exists():
            shutil.rmtree(staging)

    CSS_OUT.write_text("\n".join(out) + "\n")

    if not format_css(CSS_OUT):
        return 1

    names = set(downloaded.values())
    total = sum((FONT_DIR / n).stat().st_size for n in names)
    faces = (len(out) - 1) // 2  # each face contributes its comment and its block
    print(f"{len(names)} files, {total / 1024:.0f} KB, {faces} @font-face → {CSS_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
