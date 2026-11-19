#!/usr/bin/env python3
"""Собирает index.html и все подключённые <script src> в один HTML-файл (для игры в браузере)."""
import os
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
base = os.path.dirname(os.path.abspath(src))
html = open(src, encoding="utf-8").read()


def repl(m):
    path = os.path.join(base, m.group(1))
    code = open(path, encoding="utf-8").read().replace("</script>", "<\\/script>")
    return "<script>\n" + code + "\n</script>"


html = re.sub(r'<script src="([^"]+)"></script>', repl, html)
os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
open(dst, "w", encoding="utf-8").write(html)
print("inlined ->", dst, len(html), "bytes")
