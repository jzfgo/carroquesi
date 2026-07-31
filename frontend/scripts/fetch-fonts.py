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
cannot leave behind a file that fails `just ci` *silently*. It can still leave
one: the check pass below runs after the swap, so a genuine disagreement
between the two formatters exits 1 with the file on disk. That is the right way
round — rolling a good font refresh back over a lint quarrel would be worse —
but it is «not without saying so», not «not at all».

`.stylelintrc.json` turns `font-family-name-quotes` off for the emitted file,
and that override is load-bearing rather than cosmetic. With it on, stylelint
strips the quotes from any single-word family and this repo's
`value-keyword-case: lower` then lowercases what is left — measured, not
assumed: `'Fantasy'` becomes `fantasy` and `'Inherit'` becomes `inherit`, which
stop naming fonts and start naming a CSS generic and a CSS-wide keyword. Both
are real Google families. Off, Google's quoting survives verbatim, which is
what the header of the generated file claims and now what it does.

(`'Caption'` survives as `Caption` — case is preserved, so the `font` shorthand
keywords are not in the danger set. Only the generics and the CSS-wide
keywords are, because only they are matched lowercase.)

There is no lock. Two runs at once share the staging and backup paths and will
corrupt each other; this is a hand-run script and a lockfile is a worse trade
than the bug. One at a time.
"""

from __future__ import annotations

import os
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
   Stylelint and Prettier then lay the file out — blank lines before the
   subset comments, `unicode-range` rewrapped — which changes how it reads and
   not one value in it. Family names keep Google's quoting: `.stylelintrc.json`
   turns `font-family-name-quotes` off here, and the script's docstring says
   which two real families that rule would otherwise break.

   Vite fingerprints these files at build time, so a refreshed cut of a family
   is served under a new name and no browser can hold a stale one. */
"""


def slug(family: str) -> str:
    return family.lower().replace(" ", "-")


def format_css(path: Path) -> bool:
    """Lay the emitted file out the way `just ci` expects to find it.

    Google's CSS is not written to this repo's house style: it quotes family
    names, which `font-family-name-quotes` rejects, and it runs the
    `/* subset */` comments straight onto the previous rule, which
    `comment-empty-line-before` rejects. Neither changes a value — stylelint's
    own `--fix` resolves both — but `src/fonts.css` is in neither ignore file,
    so a run that skipped this would leave the repo one commit from a red CI
    job with no reason for anyone to suspect the font script of it.

    stylelint fixes first and prettier writes last, because prettier must have
    the final say for `format:check` to pass. Note that is *not* the order the
    checks run in — `just ci` is `format-check` then `lint`, so prettier is
    checked first and stylelint second — and the two orders being opposite is
    the point rather than an oversight.

    Which is why the fixers are not trusted to have converged. `prettier
    --write` exits 0 whether or not its rewrap has re-violated a stylelint
    rule, so running the two fixers proves only that they ran. The check pass
    below is what makes the docstring's promise true instead of likely.
    """
    for tool in (["stylelint", "--fix"], ["prettier", "--write"]):
        if subprocess.run(["pnpm", "exec", *tool, str(path)]).returncode != 0:
            print(f"{tool[0]} could not format {path}", file=sys.stderr)
            return False
    for tool in (["prettier", "--check"], ["stylelint"]):
        if subprocess.run(["pnpm", "exec", *tool, str(path)]).returncode != 0:
            print(
                f"{path} still fails {tool[0]} after formatting — the two fixers "
                "disagree, and this file would fail `just ci`. Resolve the rule "
                "conflict, or exempt src/fonts.css in .stylelintrc.json or "
                ".prettierignore from whichever rule lost. The fonts themselves "
                "are already in place; only the layout of the CSS is unsettled.",
                file=sys.stderr,
            )
            return False
    return True


def main() -> int:
    if not Path("package.json").exists():
        print("run me from frontend/", file=sys.stderr)
        return 1

    # Asked before anything is fetched or written, not when the formatter is
    # wanted. Discovering there is no pnpm *after* the swap would leave the tree
    # correct but unformatted, and exit 1 on a run that had in fact succeeded.
    if shutil.which("pnpm") is None:
        print("pnpm not on PATH — run `just frontend fetch-fonts` instead", file=sys.stderr)
        return 1

    request = urllib.request.Request(FONTS_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request) as response:
        css = response.read().decode()

    # Written beside the real files and moved over them at the end, rather than
    # into them. The replacement has to be wholesale — a family or a subset
    # removed from the request above must disappear from the tree too, and an
    # incremental write would leave it behind, still shipped and still precached
    # — but doing that in place means any failure part-way (a dropped connection
    # mid-loop, the bail below) leaves `src/assets/fonts/` empty or half-filled
    # while `src/fonts.css` still names all ten files. The build breaks, and
    # nothing on screen says the remedy is `git checkout`.
    #
    # The fonts and the CSS have to move together, so the old directory is
    # *renamed aside* rather than deleted: until both moves have landed there is
    # a complete copy of the previous state on disk, and the `finally` puts it
    # back. Deleting first and renaming second — which is what this did until the
    # re-review — has a window where a failed rename destroys the old set and the
    # cleanup then destroys the new one, leaving neither. Rare, and worse than
    # the bug being fixed. The point is not that the rollback is thorough; it is
    # that no step in the region is irreversible, which is what makes a rollback
    # possible at all.
    #
    # All three of these are siblings of what they replace, by construction, so
    # `rename` and `os.replace` stay within one filesystem and `EXDEV` cannot
    # arise. Worth saying because it is the first thing a reader re-worries.
    staging = FONT_DIR.with_name(FONT_DIR.name + ".partial")
    backup = FONT_DIR.with_name(FONT_DIR.name + ".previous")
    css_staging = CSS_OUT.with_suffix(CSS_OUT.suffix + ".partial")
    # `ignore_errors`, and checked afterwards: whatever stopped a previous run
    # from removing these may still be holding them, and an uncaught traceback
    # here fires before anything is protected.
    for leftover in (staging, backup):
        shutil.rmtree(leftover, ignore_errors=True)
        if leftover.exists():
            print(f"{leftover} is in the way and will not delete — remove it", file=sys.stderr)
            return 1
    staging.mkdir(parents=True)

    out: list[str] = [HEADER]
    downloaded: dict[str, str] = {}
    swapped = False

    # Nothing half-written may outlive a failed run either: left behind inside
    # `src/`, it is untracked litter the next run would have to recognise as
    # stale rather than resumable.
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
                # The cache is keyed on the URL and the filename on family and
                # subset, and those two agree only while a family+subset pair
                # yields exactly one file. It does for all five families here —
                # the variable ones share one file across their weights and the
                # static ones have a single weight. Two ordinary edits break it:
                # an `ital` axis, and a static family requested at several
                # weights. Then two distinct URLs are downloaded to one path and
                # the second silently overwrites the first, every affected block
                # points at whichever landed last, and the summary below
                # under-reports because it counts unique names. Measured with
                # `Nunito:ital,wght@0,400;1,400`: four blocks, two files, the
                # roman text rendering the italic cut, exit 0.
                #
                # A naming scheme is the wrong fix — there is no good name to
                # invent for a case that does not exist yet. Stopping is right,
                # and the same call the reserved-name check used to make: this
                # is only reachable by editing `FONTS_URL`, and that edit should
                # fail loudly rather than produce ten plausible files.
                if name in downloaded.values():
                    print(
                        f"{name} is wanted by two different files — "
                        f"{slug(family)}-{subset} no longer identifies one. Put the "
                        "style and weight in the name before requesting this.",
                        file=sys.stderr,
                    )
                    return 1
                request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(request) as response:
                    (staging / name).write_bytes(response.read())
                downloaded[url] = name

            out.append(f"/* {subset} */")
            out.append(SRC_RE.sub(f"url('./assets/fonts/{name}')", block))

        if not downloaded:
            print("no @font-face blocks matched — did the CSS format change?", file=sys.stderr)
            return 1

        # Everything is on disk and the CSS names only files that exist, so the
        # two moves go back to back with nothing between them that can fail.
        # The CSS is written here, not after the swap: `out` has been complete
        # since the loop ended, and leaving the write outside meant new fonts
        # could sit under CSS naming the old ones. Harmless while the filenames
        # are stable — and the only reason to run this script is to change
        # `FONTS_URL` or `SUBSETS`, which is exactly the run where they move.
        css_staging.write_text("\n".join(out) + "\n")
        if FONT_DIR.exists():
            FONT_DIR.rename(backup)
        staging.rename(FONT_DIR)
        os.replace(css_staging, CSS_OUT)
        swapped = True
    finally:
        if swapped:
            # `ignore_errors` because a swap that has landed must not be
            # reported as a failure over a directory that would not delete. But
            # a *partial* removal then survives a run that printed success, so
            # say so — otherwise it sits there untracked, one `git add -A` from
            # committing a second copy of the fonts, and the next run trips over
            # it before anything is protected.
            shutil.rmtree(backup, ignore_errors=True)
            if backup.exists():
                print(
                    f"the refresh succeeded, but {backup} would not delete — "
                    "remove it by hand before the next run",
                    file=sys.stderr,
                )
        else:
            # Publication never started, or started and did not finish. Either
            # way the tree goes back to what it was, rather than to whichever
            # half happened to land. Wrapped, because an exception raised in
            # here would replace the one that caused the rollback and point the
            # traceback at the cleanup instead of the cause.
            try:
                shutil.rmtree(staging, ignore_errors=True)
                css_staging.unlink(missing_ok=True)
                if backup.exists():
                    shutil.rmtree(FONT_DIR, ignore_errors=True)
                    backup.rename(FONT_DIR)
            except OSError as cleanup_error:
                print(
                    f"rollback did not complete: {cleanup_error}. The previous "
                    f"fonts are at {backup}; the error below is what started it.",
                    file=sys.stderr,
                )

    if not format_css(CSS_OUT):
        return 1

    names = set(downloaded.values())
    total = sum((FONT_DIR / n).stat().st_size for n in names)
    faces = (len(out) - 1) // 2  # each face contributes its comment and its block
    print(f"{len(names)} files, {total / 1024:.0f} KB, {faces} @font-face → {CSS_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
