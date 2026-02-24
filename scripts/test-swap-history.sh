#!/usr/bin/env bash
#
# Runs curl checks for GET /api/swap-history and related endpoints.
# Verifies status codes and response shape (error vs swaps array).
#
# Usage (from repo root):
#   ./scripts/test-swap-history.sh
#   BASE_URL=http://localhost:3001 ./scripts/test-swap-history.sh
#   ACCESS_TOKEN=eyJ... ./scripts/test-swap-history.sh   # optional: test authenticated swap-history
#
# Requires: curl. Optional: jq for stricter JSON shape checks.

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
FAILED=0

# Optional: prefer jq for JSON checks
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
else
  HAS_JQ=0
fi

red() { printf '\033[0;31m%s\033[0m\n' "$1"; }
green() { printf '\033[0;32m%s\033[0m\n' "$1"; }

# 1) GET /api/swap-history without auth -> expect 401
echo "=== 1. GET /api/swap-history (no auth) -> expect 401 ==="
RESP=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/swap-history") || true
HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)
if [ "$HTTP_CODE" = "401" ]; then
  green "  OK: got 401"
else
  red "  FAIL: expected 401, got ${HTTP_CODE}"
  FAILED=1
fi
if echo "$HTTP_BODY" | grep -q '"error"'; then
  green "  OK: response contains \"error\""
else
  red "  FAIL: response should contain \"error\""
  FAILED=1
fi

# 2) GET /api/swap-history?limit=10 without auth -> still 401
echo ""
echo "=== 2. GET /api/swap-history?limit=10 (no auth) -> expect 401 ==="
RESP=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/swap-history?limit=10") || true
HTTP_CODE=$(echo "$RESP" | tail -n 1)
if [ "$HTTP_CODE" = "401" ]; then
  green "  OK: got 401"
else
  red "  FAIL: expected 401, got ${HTTP_CODE}"
  FAILED=1
fi

# 3) If ACCESS_TOKEN set: GET with token -> expect 200 and "swaps" array
if [ -n "$ACCESS_TOKEN" ]; then
  echo ""
  echo "=== 3. GET /api/swap-history?accessToken=... -> expect 200, swaps array ==="
  RESP=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/swap-history?limit=5&accessToken=${ACCESS_TOKEN}") || true
  HTTP_BODY=$(echo "$RESP" | head -n -1)
  HTTP_CODE=$(echo "$RESP" | tail -n 1)
  if [ "$HTTP_CODE" = "200" ]; then
    green "  OK: got 200"
  else
    red "  FAIL: expected 200, got ${HTTP_CODE}"
    FAILED=1
  fi
  if echo "$HTTP_BODY" | grep -q '"swaps"'; then
    green "  OK: response contains \"swaps\""
  else
    red "  FAIL: response should contain \"swaps\""
    FAILED=1
  fi
  if [ "$HAS_JQ" -eq 1 ]; then
    if echo "$HTTP_BODY" | jq -e '.swaps | type == "array"' >/dev/null 2>&1; then
      green "  OK: .swaps is an array (jq)"
    else
      red "  FAIL: .swaps is not an array (jq)"
      FAILED=1
    fi
  fi
else
  echo ""
  echo "=== 3. (skipped: set ACCESS_TOKEN to test authenticated swap-history) ==="
fi

# 4) GET /api/test-0g-preflight -> expect 200
echo ""
echo "=== 4. GET /api/test-0g-preflight -> expect 200 ==="
RESP=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/test-0g-preflight") || true
HTTP_CODE=$(echo "$RESP" | tail -n 1)
if [ "$HTTP_CODE" = "200" ]; then
  green "  OK: got 200"
else
  red "  FAIL: expected 200, got ${HTTP_CODE}"
  FAILED=1
fi

# 5) GET /api/test-zg-inference-storage-e2e -> expect 200 and storedChatContext or similar
echo ""
echo "=== 5. GET /api/test-zg-inference-storage-e2e -> expect 200 ==="
RESP=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/test-zg-inference-storage-e2e") || true
HTTP_BODY=$(echo "$RESP" | head -n -1)
HTTP_CODE=$(echo "$RESP" | tail -n 1)
if [ "$HTTP_CODE" = "200" ]; then
  green "  OK: got 200"
else
  red "  FAIL: expected 200, got ${HTTP_CODE}"
  FAILED=1
fi
if echo "$HTTP_BODY" | grep -qE '"(storedChatContext|ok|memory)"'; then
  green "  OK: response has expected key"
else
  # Endpoint might return different shape; 200 is main check
  echo "  (response shape not asserted)"
fi

echo ""
if [ $FAILED -eq 0 ]; then
  green "All checks passed."
  exit 0
else
  red "Some checks failed."
  exit 1
fi
