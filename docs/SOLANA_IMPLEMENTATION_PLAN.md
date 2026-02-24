# Solana Implementation Plan: 0x Integration, Quotes & Swap (SOL / USDC)

This document outlines a plan to add Solana mainnet support through the **0x Solana Swap API**, with quotes and swapping for **SOL** and **USDC** to start.

---

## 1. Scope (MVP)

- **Chain:** Solana mainnet only (no devnet in initial scope).
- **Tokens:** SOL (native), USDC (SPL).
- **Features:** Get quote from 0x → return swap instructions / serialized tx → client signs and sends with Privy Solana wallet.
- **0x integration:** Use existing `ZEROX_API_KEY`; 0x Solana endpoint is separate from EVM but same key.

---

## 2. 0x Solana API (Reference)

- **Endpoint:** `POST https://api.0x.org/solana/swap-instructions`
- **Headers:** `0x-api-key: <ZEROX_API_KEY>`, `Content-Type: application/json`
- **Body (example SOL → USDC):**
  ```json
  {
    "token_in": "So11111111111111111111111111111111111111112",
    "token_out": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount_in": 1000000,
    "slippage_bps": 50,
    "taker": "<user_solana_public_key_base58>"
  }
  ```
- **Token mints (Solana mainnet):**
  - **SOL (native):** `So11111111111111111111111111111111111111112` (wrapped SOL)
  - **USDC:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **Response:** Contains `instructions` (array of program_id, accounts, data) that the client (or server) turns into a Solana `VersionedTransaction`, signs, and sends.

Reference: [0x Solana Example](https://github.com/0xProject/0x-solana-example) (TypeScript).

---

## 3. Architecture Overview

| Layer        | EVM (current)              | Solana (new)                          |
|-------------|-----------------------------|----------------------------------------|
| Chain config | `blockchain_config.ts` + `chain_info.ts` | Add `SOLANA_MAINNET`, Solana RPC / explorer |
| Token config | `config/token_info/*_tokens.ts` (address) | Add `config/token_info/solana_tokens.ts` (mint addresses) |
| Quote API   | `POST /api/test-swap` (0x v1/v2) | Extend or branch: when `chain === 'SOLANA_MAINNET'` call 0x Solana API |
| Swap execution | `useSwap` (ethers, EIP-1193, sign & send) | New `useSolanaSwap` (or branch): @solana/web3.js, Privy Solana wallet, sign & send |
| Wallet      | Privy EVM embedded / external | Privy Solana (embedded + external); config `ethereum-and-solana` |
| UI          | Network selector (EVM chains) | Add “Solana Mainnet” as `SOLANA_MAINNET`; when selected, use Solana swap flow |

---

## 4. Implementation Steps

### Phase A: Config & types

1. **Chain key**
   - In `config/blockchain_config.ts`: add `SOLANA_MAINNET: 'SOLANA_MAINNET'` to `CHAINS`.
   - Export a type that allows EVM vs Solana (e.g. `ChainKey` includes `SOLANA_MAINNET`).

2. **Solana chain info**
   - New file e.g. `config/chain_info_solana.ts` (or extend `chain_info.ts` with a Solana section):
     - `SOLANA_MAINNET`: RPC URL (from env e.g. `NEXT_PUBLIC_SOLANA_RPC_URL` or Helius/QuickNode), explorer (e.g. `https://solscan.io`).
   - No `chainId` in the EVM sense; use a label or constant for routing.

3. **Solana token config**
   - New file `config/token_info/solana_tokens.ts`:
     - **SOL:** mint `So11111111111111111111111111111111111111112`, decimals 9, symbol `SOL`.
     - **USDC:** mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, decimals 6, symbol `USDC`.
   - Use a small adapter or type so “address” in your token type can mean “mint” on Solana (or a separate `mint` field).

### Phase B: Privy Solana

4. **Privy config**
   - In `src/lib/privy.ts` (or app config): enable Solana:
     - Set `walletChainType: 'ethereum-and-solana'` (or equivalent) so users can have both EVM and Solana.
     - Configure Solana RPC for embedded wallet if needed: `config.solana.rpcs` (mainnet RPC from env).
   - Ensure Solana connectors (e.g. Phantom, Solflare) are enabled if you want external Solana wallets.

5. **Resolve Solana wallet in app**
   - Use Privy’s Solana wallet APIs (e.g. `useSolanaWallets()` or similar) to get the active Solana public key (base58) for the current user.
   - When chain is `SOLANA_MAINNET`, use this pubkey as `taker` in 0x Solana quote requests and as signer for the swap transaction.

### Phase C: Backend – quote for Solana

6. **Extend `POST /api/test-swap` (or add Solana-specific route)**
   - If `chain === 'SOLANA_MAINNET'`:
     - Parse `sellToken`, `buyToken`, `amount`, `recipient` (recipient = Solana pubkey in base58).
     - Map symbol to mint: SOL → `So11...`, USDC → `EPjFW...`.
     - Convert amount to raw (SOL: lamports = amount * 1e9; USDC: 6 decimals).
     - Call `POST https://api.0x.org/solana/swap-instructions` with:
       - `token_in`, `token_out`, `amount_in`, `slippage_bps`, `taker`.
     - Return to client either:
       - **Option A:** Serialized transaction (base64) that the client signs with Privy Solana and sends; or
       - **Option B:** Raw `instructions` + `recentBlockhash` (and maybe `payer`) so the client builds the `VersionedTransaction`, signs, and sends.
   - Keep existing EVM logic unchanged when `chain` is any EVM chain.

7. **Env**
   - Reuse `ZEROX_API_KEY` for 0x Solana.
   - Add `NEXT_PUBLIC_SOLANA_RPC_URL` (or `SOLANA_RPC_URL` for server) for Solana mainnet RPC.

### Phase D: Frontend – Solana swap execution

8. **Solana dependencies**
   - Add `@solana/web3.js` (and optionally `@solana/wallet-adapter-*` if not using only Privy).
   - Use Privy’s Solana signer for the swap tx (no private key in frontend; sign via Privy).

9. **`useSolanaSwap` hook (or branch inside a unified `useSwap`)**
   - Input: chain = `SOLANA_MAINNET`, sellToken (SOL | USDC), buyToken (SOL | USDC), amount (human).
   - Get Solana wallet from Privy (publicKey).
   - Call your backend (e.g. `POST /api/test-swap` with `chain: 'SOLANA_MAINNET'`, …) to get quote + instructions or serialized tx.
   - Build Solana `VersionedTransaction` (if backend returns instructions) or deserialize (if backend returns serialized tx).
   - Sign with Privy Solana wallet (e.g. `signTransaction` or equivalent).
   - Send via `connection.sendRawTransaction` (or `sendTransaction` with the signed tx).
   - Return transaction signature for UI / history.

10. **Chat / swap flow**
    - When user selects “Solana Mainnet” and asks for a swap (e.g. “swap 0.1 SOL for USDC”):
      - Backend already returns 0x Solana quote when `chain === 'SOLANA_MAINNET'`.
      - Frontend detects Solana and uses `useSolanaSwap` instead of EVM `useSwap` to execute (sign + send).
    - Ensure `record-swap` and swap history can store `chain: 'SOLANA_MAINNET'` and Solana tx signatures (no `txHash` in EVM sense; use signature string).

### Phase E: UI and product details

11. **Network selector**
    - Replace “Solana (coming soon)” with “Solana Mainnet” and `key: 'SOLANA_MAINNET'`.
    - When `selectedChain === 'SOLANA_MAINNET'`, balance fetch and swap use Solana RPC + Solana wallet (separate from EVM balances).

12. **Balances**
    - For Solana mainnet, either:
      - Add a small `GET/POST /api/balances-solana` that returns SOL balance (and optionally USDC SPL balance) for the Privy Solana pubkey; or
      - Extend existing balances API with a `chain` branch that, when `SOLANA_MAINNET`, calls Solana RPC and returns SOL/USDC.

13. **Withdraw**
    - Withdraw is currently ETH-only (EVM). For Solana, a separate “Send SOL” (and later “Send USDC”) flow can be added later; out of scope for this MVP.

14. **Model / prompts**
    - Update base prompt and MODEL_README to mention Solana: e.g. “Supported chains: Base, Ethereum, Arbitrum (EVM); Solana (SOL, USDC).”
    - Ensure SWAP_INTENT and chat can express “SOL” and “USDC” on Solana (same symbol names, different chain).

---

## 5. Token Reference (Solana mainnet)

| Symbol | Mint address | Decimals |
|--------|--------------|----------|
| SOL (wrapped) | `So11111111111111111111111111111111111111112` | 9 |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |

Use these in `config/token_info/solana_tokens.ts` and in the 0x Solana request body (`token_in` / `token_out`).

---

## 6. Risks & mitigations

- **0x Solana liquidity:** 0x Solana may have less liquidity than Jupiter. If quotes fail or are poor, consider adding a **Jupiter** fallback (quote + swap API) for Solana later; keep 0x as first choice for “0x integration” consistency.
- **Privy Solana + embedded wallet:** Ensure embedded Solana wallet creation and RPC config are correct so users can hold SOL/USDC and sign txs.
- **Two wallet types:** Users will have an EVM address and a Solana pubkey; balance and swap UIs must clearly reflect “which chain” and “which wallet.”

---

## 7. Testing checklist (once implemented)

- [ ] Select “Solana Mainnet” in network selector; balance shows SOL (and optionally USDC).
- [ ] Request quote: “swap 0.01 SOL for USDC” on Solana → backend returns 0x Solana quote (or instructions).
- [ ] Execute swap: user confirms → frontend builds/signs/sends Solana tx → tx confirms on Solana; UI shows success and signature link (e.g. solscan).
- [ ] Reverse: “swap 10 USDC for SOL” on Solana → quote + execution work.
- [ ] Swap history and record-swap accept `chain: SOLANA_MAINNET` and Solana signature.
- [ ] No regressions: EVM chains (Base, Ethereum, Arbitrum) still quote and swap as today.

---

## 8. Optional later

- **Jupiter fallback** for Solana if 0x Solana is insufficient.
- **More Solana tokens** (e.g. USDT, mSOL) via config and 0x/Jupiter mints.
- **Solana withdraw:** Send SOL (and SPL USDC) to another address.

This plan keeps “0x integration” for Solana (quotes + swap instructions) and focuses on SOL and USDC on Solana mainnet first.
