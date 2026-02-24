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
- `PRIVY_WALLET_AUTH_PRIVATE_KEY`

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

## 0G Diagnostics Endpoints

- `GET /api/test-0g-preflight`
- `POST /api/test-0g-write-read`
- `POST /api/test-0g-get-memory`
- `GET /api/test-user-memory-namespace`
