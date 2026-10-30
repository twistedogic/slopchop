#!/usr/bin/env bash
# Asserts the contentlayer behaviours the renderer has to defend against.
# The diff against expected.html proves the reproduction is unchanged; the
# greps prove each behaviour individually, so a failure names the hole.
set -euo pipefail
cd "$(dirname "$0")"
actual="$(mktemp)"
trap 'rm -f "$actual"' EXIT
./run.sh > "$actual"

diff -u expected.html "$actual"

grep -q 'href="javascript:alert(3)"' "$actual"
grep -q 'href="data:text/html;base64,' "$actual"
grep -q 'href="https://evil.example/a">paren</a>b) tail' "$actual"
grep -q 'href="https://evil.example/a)b"' "$actual"

echo "ok: contentlayer keeps javascript: and data: destinations, truncates a plain destination at its first ), and keeps an angle bracket destination whole"
