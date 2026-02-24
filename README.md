# Altair DeFi (Base + 0G)

Altair is a Next.js app that integrates:

- Privy embedded wallets
- Swap flows and quote handling
- 0G user-scoped chat memory with fallback behavior

## Run Locally

```bash
corepack yarn install
corepack yarn dev
```

App runs at `http://localhost:3000`.

## Core Environment Variables

### Privy
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `PRIVY_VERIFICATION_KEY`
- `PRIVY_WALLET_AUTH_PRIVATE_KEY` (or `PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY` as alias)

### OpenAI
- `OPENAI_API_KEY`

### 0G
- `ZG_PRIVATE_KEY`
- `ZG_RPC_URL` (default: `https://evmrpc-testnet.0g.ai`)
- `ZG_INDEXER_RPC` (default: `https://indexer-storage-testnet-turbo.0g.ai`)
- `ZG_NETWORK` (default: `testnet`)

Optional controls:
- `ZG_STORAGE_MODE=onchain_0g|hybrid|local_only` (default `hybrid`)
- `ZG_ENABLE_LOCAL_FALLBACK=true|false` (default `true`)
- `ZG_CIRCUIT_BREAKER_THRESHOLD` (default `3`)
- `ZG_CIRCUIT_BREAKER_COOLDOWN_MS` (default `300000`)
- `ZG_LOCAL_FALLBACK_PATH` (default `.cache/zg-memory-fallback.json`)
- `ZG_LOCAL_INDEX_PATH` (default `.cache/zg-storage-index.json`)

## User-Scoped 0G Chat Memory

Chat memory is persisted per user namespace and reused across sessions:

- Namespace format: `privy:<userId>:wallet:<address>`
- Primary key: `chat_summary_latest`
- Storage backend: 0G file storage (with local fallback in hybrid mode)

`/api/chat` flow:

1. **Pre-read memory** for current user namespace.
2. **Inject compact memory context** into OpenAI system prompt as `User Memory Context`.
3. **Post-write updated summary** (`v2`) to `chat_summary_latest`.

This enables user-specific recall after logout/login when the same Privy account is used.

## 0G SDK Patch (Galileo Testnet)

`@0glabs/0g-ts-sdk` can require ABI patching to match current Galileo contract behavior.

- **Automatic:** `postinstall` runs `scripts/patch-0g-sdk.js`
- **Manual:** `yarn patch:0g` or `npm run patch:0g`

Patch reference:
- [MattWong-ca/ethdenver-2026 patch-0g-sdk.js](https://github.com/MattWong-ca/ethdenver-2026/blob/main/templates/storage/scripts/patch-0g-sdk.js)

Low-level flow submit diagnostics (for debugging `flow.submit` reverts):

- Run from repo root: `npm run diag:0g-submit` or `node scripts/diag-0g-submit.js`
- Captures chain/indexer/node context and attempts one upload; prints full error details on failure.

## 0G Diagnostics Endpoints

- `GET /api/test-0g-preflight`
- `POST /api/test-0g-write-read`
- `POST /api/test-0g-get-memory`
- `GET /api/test-user-memory-namespace`
- `GET /api/test-zg-inference-storage-e2e` — writes `chat_summary_latest`, reads it back, returns `storedChatContext` for verification

## Swap execution (0x)

When the AI returns a `SWAP_INTENT` JSON (`sell`, `buy`, `amount`), the client executes the swap on-chain:

- **Supported pairs:** ETH→WETH, ETH→USDC, WETH→USDC (must match `/api/test-swap`).
- **Backend:** `POST /api/test-swap` uses the 0x Swap API for quotes; the client then sends the transaction via the user’s Privy wallet.
- **0x and testnets:** 0x Swap API supports **Base mainnet**, not Base Sepolia testnet. For swaps, use the network selector → **Base Mainnet** (and have ETH there). Base Sepolia will return “no route” from 0x.
- **Env (required for swaps):** `ZEROX_API_KEY` — 0x Swap API v2 requires an API key ([dashboard.0x.org](https://dashboard.0x.org/apps)). Set in `.env` and restart the dev server. Per-chain token overrides: `BASE_SEPOLIA_WETH_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` (and same pattern for other chain keys) if you need to override the built-in token addresses.
- **Chain:** Determined by app config and user’s selected chain; wallet must be on the correct network.
