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

- **Supported sell:** ETH, WETH, USDC, USDT, DAI. **Supported buy:** ETH, WETH, USDC, USDT, DAI (e.g. sell USDC → buy ETH). Per-chain token addresses and decimals in `config/token_info`; amount is human-readable (server converts to raw).
- **Chains:** Base Mainnet, Ethereum Mainnet, Arbitrum One (0x v2). Testnets: Base Sepolia, ETH Sepolia (0x v1; limited liquidity). **Solana:** planned; not yet supported (UI shows “Solana (coming soon)”).
- **Backend:** `POST /api/test-swap` uses the 0x Swap API (v2 for mainnets, v1 for testnets); the client sends the transaction via the user’s Privy wallet.
- **Env (required for mainnet swaps):** `ZEROX_API_KEY` — 0x v2 requires an API key ([dashboard.0x.org](https://dashboard.0x.org/apps)). Per-chain token overrides: `BASE_MAINNET_USDC_ADDRESS`, `ARBITRUM_ONE_USDT_ADDRESS`, etc. (pattern: `<CHAIN_KEY>_<SYMBOL>_ADDRESS`).

## Swap history (0G)

Executed swaps are stored in 0G as a **separate category** from chat memory:

- **Storage key:** `swap_history` (same user namespace as `chat_summary_latest`).
- **Schema:** `{ schemaVersion: 'v1', swaps: [{ chain, sellToken, buyToken, sellAmount, txHash, timestamp }, ...] }` (capped at 100 entries).
- **Recording:** After a successful swap, the client calls `POST /api/record-swap` with `accessToken`, `chain`, `sellToken`, `buyToken`, `sellAmount`, `txHash`; the server appends to the user’s `swap_history` in 0G (or local fallback).
- **Read history:** `GET /api/swap-history` returns the current user’s swap history (requires `privy-token` cookie or `?accessToken=...`). Optional `?limit=50` (default 50, max 100). Run `npm run test:swap-history` (or `./scripts/test-swap-history.sh`) with the dev server up to verify status codes and response shape; set `ACCESS_TOKEN` to test authenticated response.
- **Chat context:** `/api/chat` pre-reads `swap_history` and injects the last 10 swaps into the system prompt as “User swap history” so the AI can reference past swaps.
