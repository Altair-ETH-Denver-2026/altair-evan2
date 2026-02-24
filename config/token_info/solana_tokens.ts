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

/** Top 5 additional Solana tokens (swap + wallet display). */
export const JUP = { symbol: 'JUP', name: 'Jupiter', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 };
export const RAY = { symbol: 'RAY', name: 'Raydium', address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6 };
export const KMNO = { symbol: 'KMNO', name: 'Kamino Finance', address: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS', decimals: 6 };
export const DRIFT = { symbol: 'DRIFT', name: 'Drift Protocol', address: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7', decimals: 6 };
export const W = { symbol: 'W', name: 'Wormhole', address: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', decimals: 6 };

/** All swapable + display tokens on Solana mainnet (SOL, USDC + top 5). */
export const SOLANA_MAINNET_TOKENS: ChainTokens = {
  SOL,
  USDC,
  JUP,
  RAY,
  KMNO,
  DRIFT,
  W,
};

/** Ordered list of token symbols to show under Solana in the wallet panel. */
export const SOLANA_WALLET_DISPLAY_SYMBOLS = ['SOL', 'USDC', 'JUP', 'RAY', 'KMNO', 'DRIFT', 'W'] as const;
