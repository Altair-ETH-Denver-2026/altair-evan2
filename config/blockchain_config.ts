// Default to Base Sepolia so 0x swap quotes are more likely to find a route (ETH Sepolia often has no liquidity)
export const BLOCKCHAIN = 'BASE_SEPOLIA' as const;
export const WRAP_ETH = true;

export const CHAINS = {
  BASE_SEPOLIA: 'BASE_SEPOLIA',
  ETH_SEPOLIA: 'ETH_SEPOLIA',
  ETH_MAINNET: 'ETH_MAINNET',
  BASE_MAINNET: 'BASE_MAINNET',
  ARBITRUM_ONE: 'ARBITRUM_ONE',
  SOLANA_MAINNET: 'SOLANA_MAINNET',
} as const;

export type ChainKey = keyof typeof CHAINS;

/** EVM chain keys (excludes Solana). */
export const EVM_CHAINS = [
  'BASE_SEPOLIA',
  'ETH_SEPOLIA',
  'ETH_MAINNET',
  'BASE_MAINNET',
  'ARBITRUM_ONE',
] as const;
export type EvmChainKey = (typeof EVM_CHAINS)[number];

export function isSolanaChain(chain: ChainKey): boolean {
  return chain === 'SOLANA_MAINNET';
}
