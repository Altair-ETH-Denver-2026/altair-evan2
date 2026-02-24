# Solana swap integration (Jupiter)

Solana mainnet swaps (SOL ↔ USDC) use the **Jupiter Swap API**. 0x does not offer a Solana swap product, so we do not use 0x for Solana.

## Flow

1. **Quote** – Backend calls Jupiter quote API with `inputMint`, `outputMint`, `amount` (raw), and `slippageBps`.
2. **Swap** – Backend calls Jupiter swap API with the quote and the user’s Solana public key; Jupiter returns a base64-encoded unsigned transaction.
3. **Sign & send** – Client deserializes the transaction, signs with the user’s Privy Solana wallet, and sends via Solana RPC.

## API (Ultra Swap)

We use the **Ultra Swap API** (same key you created in the portal):

- **Order:** `GET https://api.jup.ag/ultra/v1/order?inputMint=...&outputMint=...&amount=...&taker=<user_solana_pubkey>` with header `x-api-key: JUPITER_API_KEY`
- **Response:** `{ transaction: string }` (base64) — client deserializes, signs with Privy, and sends via Solana RPC.

## Tokens

- **SOL:** mint `So11111111111111111111111111111111111111112`
- **USDC:** mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

Defined in `config/token_info/solana_tokens.ts`.

## Env

- **Required:** `JUPITER_API_KEY` — Jupiter’s quote and swap endpoints require an API key. Get one at [portal.jup.ag/api-keys](https://portal.jup.ag/api-keys) (sign in with Google or email), then add to `.env` and restart the server.
- **Optional:** `NEXT_PUBLIC_SOLANA_RPC_URL` / `SOLANA_RPC_URL` — Solana RPC; defaults to public endpoint.

## References

- [Jupiter Swap API](https://dev.jup.ag/docs/swap-api)
- [Get Quote](https://dev.jup.ag/docs/swap-api/get-quote)
- [Build swap transaction](https://dev.jup.ag/docs/swap-api/build-swap-transaction)
