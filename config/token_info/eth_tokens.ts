import type { ChainTokens } from './types';

export const WETH = {
  symbol: 'WETH',
  name: 'Wrapped Ether',
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  decimals: 18,
};

export const USDC = {
  symbol: 'USDC',
  name: 'USD Coin',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  decimals: 6,
};

export const USDT = {
  symbol: 'USDT',
  name: 'Tether USD',
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  decimals: 6,
};

export const DAI = {
  symbol: 'DAI',
  name: 'Dai Stablecoin',
  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  decimals: 18,
};

export const ETH_MAINNET_TOKENS: ChainTokens = {
  WETH: WETH,
  USDC: USDC,
  USDT: USDT,
  DAI: DAI,
};
