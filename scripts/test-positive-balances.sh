#!/usr/bin/env bash
# Test: fetch token balances and list only tokens with positive balance.
# Requires: dev server running (e.g. yarn dev), and ACCESS_TOKEN (Privy token from browser).
# Usage:
#   ACCESS_TOKEN=your_token ./scripts/test-positive-balances.sh
#   ACCESS_TOKEN=your_token ./scripts/test-positive-balances.sh evm   # Ethereum, Base, Arbitrum mainnet only
# Or add ACCESS_TOKEN=... to .env and run: ./scripts/test-positive-balances.sh

set -e
BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${ACCESS_TOKEN:-}"
# Optional: evm = only ETH_MAINNET, BASE_MAINNET, ARBITRUM_ONE
CHAINS_ARG="${1:-}"
if [ "$CHAINS_ARG" = "evm" ]; then
  CHAINS_JSON='"chains": ["ETH_MAINNET", "BASE_MAINNET", "ARBITRUM_ONE"]'
else
  CHAINS_JSON=""
fi

if [ -z "$TOKEN" ]; then
  echo "No ACCESS_TOKEN set. Set it with: export ACCESS_TOKEN=your_privy_token"
  echo "Or: ACCESS_TOKEN=your_token $0 [evm]"
  exit 1
fi

echo "Fetching positive balances from $BASE_URL/api/balances/positive ..."
if [ -n "$CHAINS_JSON" ]; then
  echo "Chains: Ethereum, Base, Arbitrum mainnet only"
  BODY="{\"accessToken\": \"$TOKEN\", $CHAINS_JSON}"
else
  BODY="{\"accessToken\": \"$TOKEN\"}"
fi
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/balances/positive" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "HTTP $HTTP_CODE"
  (echo "$BODY" | jq . 2>/dev/null) || echo "$BODY"
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  echo "$BODY" | jq .
  echo ""
  echo "--- Tokens with positive balance ---"
  echo "$BODY" | jq -r '.positiveBalances[]? | "\(.chain)  \(.token): \(.balance)"' 2>/dev/null || echo "$BODY" | jq -r '(.positiveBalances // [])[] | "\(.chain)  \(.token): \(.balance)"'
  echo "--- Total: $(echo "$BODY" | jq -r '.count // 0') ---"
else
  echo "$BODY"
  echo "--- (install jq for pretty output) ---"
fi
