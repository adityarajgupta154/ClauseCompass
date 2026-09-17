#!/usr/bin/env sh
# Proves the web client never references a server-side secret: greps the client
# source, then builds the production bundle and greps that too. Any hit fails;
# so does a grep that could not run (fail closed).
#
# Usage: pnpm check:client-secrets   (or: sh scripts/check-client-bundle.sh)
set -eu

cd "$(git rev-parse --show-toplevel)"

CLIENT=artifacts/clausecompass
# Names of server-only variables, the Anthropic key prefix and the Redis URL schemes.
FORBIDDEN='ANTHROPIC_API_KEY|OPENAI_API_KEY|SESSION_SECRET|SESSION_STORE_TOKEN|SESSION_STORE_KEY|SESSION_STORE_URL|KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN|REDIS_URL|sk-ant-|redis://|rediss://'

# scan <what> <path>... : exit 1 on a match (status 0) or a grep failure (status >= 2).
scan() {
  what=$1
  shift
  set +e
  grep -rnE "$FORBIDDEN" "$@"
  status=$?
  set -e
  case $status in
    0) echo "FAIL: a server secret name appears in $what." >&2; exit 1 ;;
    1) echo "OK: nothing found in $what." ;;
    *) echo "FAIL: grep could not scan $what (exit $status)." >&2; exit 1 ;;
  esac
}

echo "Scanning $CLIENT source..."
scan "client source" "$CLIENT/src" "$CLIENT/index.html"

echo "Building $CLIENT bundle..."
PORT="${PORT:-5173}" BASE_PATH="${BASE_PATH:-/}" \
  pnpm --filter @workspace/clausecompass run build > /dev/null

echo "Scanning $CLIENT/dist/public..."
scan "the client bundle" "$CLIENT/dist/public"

echo "OK: no server secret names in client source or bundle."
