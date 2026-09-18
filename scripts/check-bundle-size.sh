#!/usr/bin/env sh
# Checks the built web assets without building them. Budgets are 125,000 bytes
# gzip for the entry chunk and 320,000 bytes gzip for all JavaScript: about
# 15 percent above the measured 107,610-byte and 276,536-byte production build.
set -eu

cd "$(git rev-parse --show-toplevel)"

DIST=artifacts/clausecompass/dist/public
ASSETS=$DIST/assets
ENTRY_LIMIT=125000
TOTAL_LIMIT=320000

if [ ! -d "$ASSETS" ] || [ ! -f "$DIST/index.html" ]; then
  echo "FAIL: no built ClauseCompass assets; run the client build first." >&2
  exit 2
fi

ENTRY=$(sed -n 's/.*src="[^"]*\/\(assets\/index-[^"]*\.js\)".*/\1/p' "$DIST/index.html" | head -1)
if [ -z "$ENTRY" ] || [ ! -f "$DIST/$ENTRY" ]; then
  echo "FAIL: could not identify the entry chunk from $DIST/index.html." >&2
  exit 2
fi

SIZES=$(mktemp)
trap 'rm -f "$SIZES"' EXIT INT TERM

find "$ASSETS" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' \) | sort |
  while IFS= read -r file; do
    raw=$(wc -c < "$file" | tr -d ' ')
    gzip_bytes=$(gzip -c "$file" | wc -c | tr -d ' ')
    printf '%s\t%s\t%s\n' "$raw" "$gzip_bytes" "${file##*/}"
  done > "$SIZES"

if [ ! -s "$SIZES" ]; then
  echo "FAIL: measured no JavaScript or CSS assets." >&2
  exit 2
fi

printf '%10s %10s  %s\n' RAW GZIP FILE
awk -F '\t' '{ printf "%10d %10d  %s\n", $1, $2, $3 }' "$SIZES"

ENTRY_NAME=${ENTRY#assets/}
ENTRY_GZIP=$(awk -F '\t' -v entry="$ENTRY_NAME" '$3 == entry { print $2 }' "$SIZES")
TOTAL_GZIP=$(awk -F '\t' '$3 ~ /\.js$/ { total += $2 } END { print total + 0 }' "$SIZES")

if [ -z "$ENTRY_GZIP" ]; then
  echo "FAIL: entry chunk $ENTRY_NAME was not measured." >&2
  exit 2
fi

printf 'Entry JavaScript gzip: %s bytes (limit %s)\n' "$ENTRY_GZIP" "$ENTRY_LIMIT"
printf 'Total JavaScript gzip: %s bytes (limit %s)\n' "$TOTAL_GZIP" "$TOTAL_LIMIT"

failed=0
if [ "$ENTRY_GZIP" -gt "$ENTRY_LIMIT" ]; then
  echo "FAIL: entry JavaScript exceeds its gzip budget." >&2
  failed=1
fi
if [ "$TOTAL_GZIP" -gt "$TOTAL_LIMIT" ]; then
  echo "FAIL: total JavaScript exceeds its gzip budget." >&2
  failed=1
fi
[ "$failed" -eq 0 ] || exit 1

echo "OK: bundle is within both gzip budgets."