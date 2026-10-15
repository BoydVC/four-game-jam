#!/usr/bin/env python3
"""Regenerate CHIP-8 ROM bytes, then inline web/ (CSS + every <script src>) into
dist/four-game-jam.html (offline single file) + dist/index.html."""
import os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")
DIST = os.path.join(HERE, "dist")
os.makedirs(DIST, exist_ok=True)
subprocess.run([sys.executable, os.path.join(HERE, "tools", "roms.py")], check=True, stdout=subprocess.DEVNULL)
html = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()


def read(name):
    return open(os.path.join(WEB, name), encoding="utf-8").read()


# Callable replacements so re.sub never reinterprets backslashes inside CSS/JS.
out = re.sub(r'<link\s+rel="stylesheet"\s+href="([\w.-]+\.css)"\s*/?>',
             lambda m: "<style>\n" + read(m.group(1)) + "\n</style>", html)
out = re.sub(r'<script\s+src="([\w.-]+\.js)"\s*>\s*</script>',
             lambda m: "<script>\n" + read(m.group(1)).replace("</script", "<\\/script") + "\n</script>", out)
path = os.path.join(DIST, "four-game-jam.html")
open(path, "w", encoding="utf-8").write(out)
open(os.path.join(DIST, "index.html"), "w", encoding="utf-8").write(out)
print(f"wrote {path} ({os.path.getsize(path):,} bytes)")
