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

/** Top Solana tokens reference (symbol → name, address). Address empty = not yet supported for swap. */
export const SOLANA_TOP_TOKENS_LIST: Record<
  string,
  { symbol: string; name: string; address: string }
> = {
  JUP: { symbol: 'JUP', name: 'Jupiter', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
  RAY: { symbol: 'RAY', name: 'Raydium', address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' },
  KMNO: { symbol: 'KMNO', name: 'Kamino Finance', address: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS' },
  DRIFT: { symbol: 'DRIFT', name: 'Drift Protocol', address: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7' },
  W: { symbol: 'W', name: 'Wormhole', address: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ' },
  MET: { symbol: 'MET', name: 'Meteora', address: 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL' },
  JLP: { symbol: 'JLP', name: 'Jupiter Perps LP', address: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4' },
  JTO: { symbol: 'JTO', name: 'Jito Governance / Utility', address: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL' },
  ZBCN: { symbol: 'ZBCN', name: 'Zebec Network', address: 'ZBCNpuD7YMXzTHB2fhGkGi78MNsHGLRXUhRewNRm9RU' },
  LION: { symbol: 'LION', name: 'Loaded Lions', address: '' },
  ORCA: { symbol: 'ORCA', name: 'Orca', address: '' },
  VIRTUAL: { symbol: 'VIRTUAL', name: 'Virtuals Protocol', address: '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y' },
  WIF: { symbol: 'WIF', name: 'dogwifhat', address: '' },
  POPCAT: { symbol: 'POPCAT', name: 'Popcat', address: '' },
  PENGU: { symbol: 'PENGU', name: 'Pudgy Penguins', address: '' },
  ME: { symbol: 'ME', name: 'Magic Eden', address: 'MEFNBXixkEbait3xn9bkm8WsJzXtVsaJEn4c8Sam21u' },
  FARTCOIN: { symbol: 'FARTCOIN', name: 'Fartcoin', address: '' },
  BAN: { symbol: 'BAN', name: 'Comedian', address: '' },
  ARC: { symbol: 'ARC', name: 'AI Rig Complex', address: '' },
  TNSR: { symbol: 'TNSR', name: 'Tensor', address: 'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6' },
};
