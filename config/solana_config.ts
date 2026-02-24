/**
 * Solana mainnet config for RPC and explorer.
 * RPC: use NEXT_PUBLIC_SOLANA_RPC_URL or default public endpoint.
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
