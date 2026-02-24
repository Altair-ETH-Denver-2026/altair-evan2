import type { ChainKey } from '../../config/blockchain_config';
import { SOLANA_MAINNET } from '../../config/solana_config';
import { ARBITRUM_ONE, BASE_MAINNET, BASE_SEPOLIA, ETH_MAINNET, ETH_SEPOLIA } from '../../config/chain_info';

const EXPLORER_BASE: Record<ChainKey, string> = {
  BASE_SEPOLIA: BASE_SEPOLIA.scanUrl,
  ETH_SEPOLIA: ETH_SEPOLIA.scanUrl,
  ETH_MAINNET: ETH_MAINNET.scanUrl,
  BASE_MAINNET: BASE_MAINNET.scanUrl,
  ARBITRUM_ONE: ARBITRUM_ONE.scanUrl,
  SOLANA_MAINNET: SOLANA_MAINNET.explorerUrl,
};

/**
 * Returns the block explorer transaction URL for the given chain and tx hash/signature.
 * EVM: etherscan.io, basescan.org, arbiscan.io. Solana: solscan.io. Path: /tx/{hash}.
 */
export function getExplorerTxUrl(chain: ChainKey, txHash: string): string {
  const base = EXPLORER_BASE[chain].replace(/\/$/, '');
  return `${base}/tx/${encodeURIComponent(txHash)}`;
}
