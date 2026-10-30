#!/usr/bin/env bash
# Build the probe post with contentlayer and print the HTML it produces.
# This is the evidence behind the trail rows about link schemes and
# destination truncation. Re-run it after changing the contentlayer version.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent --no-audit --no-fund contentlayer@0.3.4
npx contentlayer build >/dev/null 2>&1 || true
node -e '
const fs = require("node:fs");
const dir = ".contentlayer/generated/Post";
const file = fs.readdirSync(dir).find((f) => f.endsWith(".json") && !f.startsWith("_"));
const d = JSON.parse(fs.readFileSync(`${dir}/${file}`, "utf8"));
console.log(d.body.html);
'
