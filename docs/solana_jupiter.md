# Solana swap integration (Jupiter)

Solana mainnet swaps (SOL ↔ USDC) use the **Jupiter Swap API**. 0x does not offer a Solana swap product, so we do not use 0x for Solana.

## Flow

1. **Quote** – Backend calls Jupiter quote API with `inputMint`, `outputMint`, `amount` (raw), and `slippageBps`.
2. **Swap** – Backend calls Jupiter swap API with the quote and the user’s Solana public key; Jupiter returns a base64-encoded unsigned transaction.
3. **Sign & send** – Client deserializes the transaction, signs with the user’s Privy Solana wallet, and sends via Solana RPC.

## API

- **Quote:** `GET https://api.jup.ag/swap/v1/quote?inputMint=...&outputMint=...&amount=...&slippageBps=50&restrictIntermediateTokens=true`
- **Swap:** `POST https://api.jup.ag/swap/v1/swap` with body `{ quoteResponse, userPublicKey, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }`
- **Response:** `{ swapTransaction: string }` (base64) — client uses `VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'))`, then signs and sends.

## Tokens

- **SOL:** mint `So11111111111111111111111111111111111111112`
- **USDC:** mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

Defined in `config/token_info/solana_tokens.ts`.

## Env

- **Optional:** `JUPITER_API_KEY` — for higher rate limits; not required for basic use.
- **Optional:** `NEXT_PUBLIC_SOLANA_RPC_URL` / `SOLANA_RPC_URL` — Solana RPC; defaults to public endpoint.

## References

- [Jupiter Swap API](https://dev.jup.ag/docs/swap-api)
- [Get Quote](https://dev.jup.ag/docs/swap-api/get-quote)
- [Build swap transaction](https://dev.jup.ag/docs/swap-api/build-swap-transaction)
