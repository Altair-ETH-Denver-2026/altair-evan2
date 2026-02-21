export const BLOCKCHAIN = 'ETH_SEPOLIA' as const;
export const WRAP_ETH = true;
export const BALANCE_DECIMALS = 8;
export const LOGO_SPIN_MIN_MS = 400;
export const LOGO_SPIN_MAX_MS = 2000;

export const BASE_SEPOLIA = {
  chainId: 84532,
  rpcUrl:
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ??
    process.env.BASE_SEPOLIA_RPC_URL ??
    'https://sepolia.base.org',
  weth: '0x4200000000000000000000000000000000000006',
  usdc:
    process.env.NEXT_PUBLIC_USDC_CONTRACT_BASE_SEPOLIA ??
    process.env.USDC_CONTRACT_BASE_SEPOLIA ??
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

export const ETH_SEPOLIA = {
  chainId: 11155111,
  rpcUrl:
    process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL ??
    process.env.ETH_SEPOLIA_RPC_URL ??
    'https://rpc.sepolia.org',
  weth: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
  usdc:
    process.env.NEXT_PUBLIC_USDC_CONTRACT_ETH_SEPOLIA ??
    process.env.USDC_CONTRACT_ETH_SEPOLIA ??
    '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
};

export const ETH_MAINNET = {
  chainId: 1,
  rpcUrl:
    process.env.NEXT_PUBLIC_ETH_MAINNET_RPC_URL ??
    process.env.ETH_MAINNET_RPC_URL ??
    'https://mainnet.infura.io/v3/<YOUR_KEY>',
  weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
};

export const BASE_MAINNET = {
  chainId: 8453,
  rpcUrl:
    process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL ??
    process.env.BASE_MAINNET_RPC_URL ??
    'https://mainnet.base.org',
  weth: '0x4200000000000000000000000000000000000006',
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

export const CHAINS = {
  BASE_SEPOLIA,
  ETH_SEPOLIA,
  ETH_MAINNET,
  BASE_MAINNET,
} as const;

export type ChainKey = keyof typeof CHAINS;
export const ACTIVE_CHAIN = CHAINS[BLOCKCHAIN];
