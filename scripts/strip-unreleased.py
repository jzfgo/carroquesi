#!/usr/bin/env python3
"""Remove any existing [Unreleased] section from CHANGELOG.md before cliff regenerates it."""
import re
import pathlib

p = pathlib.Path("CHANGELOG.md")
t = p.read_text()
t = re.sub(r"\n## \[Unreleased\].*?(?=\n## \[)", "", t, flags=re.DOTALL)
p.write_text(t)
