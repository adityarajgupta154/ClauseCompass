#!/usr/bin/env sh
# Fails when the files git would ship (tracked + untracked-but-not-ignored)
# exceed the repo size ceiling. Hack2Skill caps repos at 10 MB; we hold the
# line at 5 MiB so lockfile growth, docs, and fixtures never get close. It
# started at 2 MiB; source, tests and docs alone passed that on 15 Sep 2026
# (largest single file: the lockfile), so the ceiling moved to 3 MiB. The
# README's screenshots and journey animation (17 Sep) took the tree to 5.2
# MiB; on 18 Sep the screenshots were re-encoded at 1000 px / quality 72
# (1.06 MB to 0.61 MB) and the ceiling moved to 5 MiB, half the cap, with the
# tree at 4.74 MiB. A jump of more than ~100 KB in one change still means
# something that should not ship (a document, build output, a browser) is in
# the tree.
#
# Usage: pnpm check:size   (or: sh scripts/check-repo-size.sh)
# POSIX sh only (GNU and BSD userlands); exits 1 when over the limit and 2 when
# it cannot measure anything, so a broken checkout never passes silently.
set -eu

LIMIT_BYTES=$((5 * 1024 * 1024))

cd "$(git rev-parse --show-toplevel)"

SIZES=$(mktemp)
trap 'rm -f "$SIZES"' EXIT INT TERM

# One "bytes<TAB>path" line per file. Files still in the index but deleted from
# the working tree are skipped; they ship nothing.
git ls-files --cached --others --exclude-standard | while IFS= read -r file; do
  [ -f "$file" ] || continue
  printf '%s\t%s\n' "$(wc -c < "$file" | tr -d ' ')" "$file"
done > "$SIZES"

COUNT=$(wc -l < "$SIZES" | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
  echo "FAIL: measured no files; run this inside the git checkout." >&2
  exit 2
fi

TOTAL=$(awk -F '\t' '{ s += $1 } END { print s + 0 }' "$SIZES")

printf 'Repo payload: %s bytes across %s files (limit %s bytes)\n' "$TOTAL" "$COUNT" "$LIMIT_BYTES"
printf 'Largest files:\n'
sort -nr "$SIZES" | head -10 | awk -F '\t' '{ printf "  %8.1f KB  %s\n", $1 / 1024, $2 }'

if [ "$TOTAL" -gt "$LIMIT_BYTES" ]; then
  echo "FAIL: repo payload exceeds the $LIMIT_BYTES byte limit." >&2
  echo "Move large fixtures out, and never commit real documents or build output." >&2
  exit 1
fi

echo "OK: under limit."
