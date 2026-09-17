#!/usr/bin/env sh
# The checks to run before every submission attempt, in the order the README
# lists them: strict type check + build of every package, the lint pass, the
# offline test suite, the client secret scan, and the repo-size ceiling last
# (a payload over the ceiling must never hide a secret in the bundle). Each step prints
# its name; the first failure stops the run with that step's own output, so
# there is no summary to misread. The web build needs PORT and BASE_PATH
# (Replit injects them; a laptop rarely has them), so both default here to
# the values `pnpm dev` uses.
#
# Usage: pnpm preflight   (or: sh scripts/preflight.sh)
# POSIX sh only. Exit status is the failing step's.
set -eu

cd "$(git rev-parse --show-toplevel)"

export PORT="${PORT:-5173}"
export BASE_PATH="${BASE_PATH:-/}"

step() {
  printf '\n== %s ==\n' "$1"
  shift
  "$@"
}

step "build (type check + bundle every package)" pnpm run build
step "lint (core rules, hooks, static accessibility)" pnpm run lint
step "test (every layer, offline)" pnpm run test
step "check:client-secrets (client source and bundle)" pnpm run check:client-secrets
step "check:size (repo payload ceiling)" pnpm run check:size

printf '\nPreflight passed for the working tree. It is only valid for the commit that is pushed: commit first, or run it again after committing.\n'
