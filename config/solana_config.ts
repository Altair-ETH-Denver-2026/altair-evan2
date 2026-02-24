/**
 * Solana mainnet config for RPC and explorer.
 * RPC: NEXT_PUBLIC_SOLANA_RPC_URL (or SOLANA_RPC_URL) or public endpoint.
 * The public RPC (api.mainnet-beta.solana.com) often returns 403; use a free
 * provider (e.g. Helius, QuickNode, Alchemy) for reliable swaps.
 */
const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

export const SOLANA_MAINNET = {
  rpcUrl: SOLANA_RPC_URL,
  explorerUrl: 'https://solscan.io',
  name: 'Solana Mainnet',
} as const;
