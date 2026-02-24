import type { ChainTokens } from './types';

/** Wrapped SOL (native SOL represented as SPL token mint on Solana). */
export const SOL = {
  symbol: 'SOL',
  name: 'Wrapped SOL',
  address: 'So11111111111111111111111111111111111111112',
  decimals: 9,
};

/** USDC (Circle) on Solana mainnet. */
export const USDC = {
  symbol: 'USDC',
  name: 'USD Coin',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  decimals: 6,
};

export const SOLANA_MAINNET_TOKENS: ChainTokens = {
  SOL,
  USDC,
};
