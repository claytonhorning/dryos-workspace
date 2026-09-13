#!/usr/bin/env bash
# Compose, compile-gate and write the SQL that seeds a page into a Dryos
# account. The whole workflow: .claude/skills/seed-page/SKILL.md
#   frontend/scripts/seed-page/run.sh --user <uuid> --group <slug>
set -euo pipefail
cd "$(dirname "$0")/../.."
out="${TMPDIR:-/tmp}/dryos-seed-$$.cjs"
trap 'rm -f "$out"' EXIT
# esbuild stays external for the reason it is in serverExternalPackages, and
# NODE_PATH is what lets the bundle find it at run time.
./node_modules/.bin/esbuild scripts/seed-page/seed.ts --bundle --platform=node \
  --format=cjs --external:esbuild --outfile="$out" --log-level=warning
NODE_PATH=./node_modules node "$out" "$@"
