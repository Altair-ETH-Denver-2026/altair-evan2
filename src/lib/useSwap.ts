'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { BLOCKCHAIN, CHAINS, WRAP_ETH, isSolanaChain, type ChainKey, type EvmChainKey } from '../../config/blockchain_config';
import {
  ARBITRUM_ONE,
  BASE_MAINNET,
  BASE_SEPOLIA,
  ETH_MAINNET,
  ETH_SEPOLIA,
  resolveRpcUrls,
} from '../../config/chain_info';
import { WETH as BASE_WETH } from '../../config/token_info/base_tokens';
import { WETH as BASE_SEPOLIA_WETH } from '../../config/token_info/base_testnet_sepolia_tokens';
import { WETH as ETH_WETH } from '../../config/token_info/eth_tokens';
import { WETH as ETH_SEPOLIA_WETH } from '../../config/token_info/eth_sepolia_testnet_tokens';
import { WETH as ARBITRUM_WETH } from '../../config/token_info/arbitrum_tokens';

const chainConfigs = {
  BASE_SEPOLIA,
  ETH_SEPOLIA,
  ETH_MAINNET,
  BASE_MAINNET,
  ARBITRUM_ONE,
} as const;

const tokenConfigs = {
  BASE_SEPOLIA: { WETH: BASE_SEPOLIA_WETH },
  ETH_SEPOLIA: { WETH: ETH_SEPOLIA_WETH },
  ETH_MAINNET: { WETH: ETH_WETH },
  BASE_MAINNET: { WETH: BASE_WETH },
  ARBITRUM_ONE: { WETH: ARBITRUM_WETH },
} as const;

export const resolveSelectedChain = (explicitChain?: ChainKey) => {
  if (explicitChain) return explicitChain;
  if (typeof window === 'undefined') return BLOCKCHAIN;
  const stored = localStorage.getItem('selectedChain');
  if (stored && stored in CHAINS) return stored as ChainKey;
  return BLOCKCHAIN;
};

const ensureEvmChain = async (
  ethereumProvider: ethers.Eip1193Provider,
  chainKey: EvmChainKey,
) => {
  const chainConfig = chainConfigs[chainKey];
  console.log('[RPC] ensureEvmChain chainKey:', chainKey);
  console.log('[RPC] ensureEvmChain rpcUrls:', chainConfig.rpcUrls);
  const resolvedRpcUrls = resolveRpcUrls(chainConfig.rpcUrls);
  console.log('[RPC] ensureEvmChain resolvedRpcUrls:', resolvedRpcUrls);
  const targetChainId = `0x${chainConfig.chainId.toString(16)}`;
  const chainMeta: Record<ChainKey, { name: string; explorer: string }> = {
    ETH_MAINNET: { name: 'Ethereum Mainnet', explorer: 'https://etherscan.io' },
    ETH_SEPOLIA: { name: 'Sepolia', explorer: 'https://sepolia.etherscan.io' },
    BASE_MAINNET: { name: 'Base Mainnet', explorer: 'https://basescan.org' },
    BASE_SEPOLIA: { name: 'Base Sepolia', explorer: 'https://sepolia.basescan.org' },
    ARBITRUM_ONE: { name: 'Arbitrum One', explorer: 'https://arbiscan.io' },
    SOLANA_MAINNET: { name: 'Solana Mainnet', explorer: 'https://solscan.io' },
  };

  try {
    await ethereumProvider.request?.({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainId }],
    });
  } catch (switchError: unknown) {
    const error = switchError as { code?: number; message?: string };
    const unsupportedChain =
      error?.code === 4902 ||
      error?.code === -32602 ||
      (error?.message?.toLowerCase().includes('unsupported') ?? false);

    if (unsupportedChain) {
      await ethereumProvider.request?.({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: targetChainId,
            chainName: chainMeta[chainKey].name,
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: resolvedRpcUrls,
            blockExplorerUrls: [chainMeta[chainKey].explorer],
          },
        ],
      });
      return;
    }
    throw switchError;
  }
};

export const useSwap = (explicitChain?: ChainKey) => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  return async (sellToken: string, sellAmount: string, buyToken: string) => {
    if (!authenticated || !wallets?.length) {
      throw new Error('No authenticated wallet available.');
    }

    const selectedChain = resolveSelectedChain(explicitChain);
    if (isSolanaChain(selectedChain)) {
      throw new Error('Use useSolanaSwap for Solana. Select an EVM chain or use the Solana swap flow.');
    }
    const evmChain = selectedChain as EvmChainKey;
    console.log('[RPC] selectedChain:', selectedChain);
    const chainConfig = chainConfigs[evmChain];
    console.log('[RPC] chainConfig rpcUrls:', chainConfig?.rpcUrls);
    const tokenConfig = tokenConfigs[evmChain];
    if (!chainConfig) {
      throw new Error('Unsupported chain configuration.');
    }

    const wallet = wallets[0];
    const ethereumProvider = await wallet.getEthereumProvider();
    await ensureEvmChain(ethereumProvider, evmChain);

    const provider = new ethers.BrowserProvider(ethereumProvider);
    const signer = await provider.getSigner();
    const recipient = await signer.getAddress();

    const normalizedSell = sellToken.toUpperCase();
    const normalizedBuy = buyToken.toUpperCase();
    const effectiveSell = normalizedSell;

    if (WRAP_ETH && normalizedSell === 'ETH' && normalizedBuy === 'WETH') {
      const amountWei = ethers.parseEther(sellAmount);
      const weth = new ethers.Contract(
        tokenConfig.WETH.address,
        ['function deposit() payable'],
        signer,
      );

      const wrapTx = await weth.deposit({ value: amountWei });
      await wrapTx.wait();

      return wrapTx.hash as string;
    }

    // API expects human-readable amount; server converts to raw using sell token decimals
    const routeResponse = await fetch('/api/test-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        chain: selectedChain,
        sellToken: effectiveSell,
        buyToken: normalizedBuy,
        amount: sellAmount,
        recipient,
      }),
    });

    if (!routeResponse.ok) {
      const errorPayload = await routeResponse.json().catch(() => ({}));
      throw new Error(errorPayload?.error ?? 'Failed to fetch swap route');
    }

    const routePayload = (await routeResponse.json()) as {
      methodParameters?: { to: string; calldata: string; value: string };
      sellTokenAddress?: string;
    };

    if (!routePayload.methodParameters) {
      throw new Error('No swap route found');
    }

    // Approve sell token to router when selling an ERC20 (WETH, USDC, USDT, DAI)
    const sellTokenAddress = routePayload.sellTokenAddress ?? (effectiveSell === 'WETH' ? tokenConfig.WETH.address : undefined);
    if (sellTokenAddress) {
      const erc20 = new ethers.Contract(
        sellTokenAddress,
        ['function approve(address,uint256) returns (bool)'],
        signer,
      );
      await erc20.approve(routePayload.methodParameters.to, ethers.MaxUint256);
    }

    const tx = await signer.sendTransaction({
      to: routePayload.methodParameters.to,
      data: routePayload.methodParameters.calldata,
      value: routePayload.methodParameters.value,
      gasLimit: 1_000_000n,
    });

    await tx.wait();
    return tx.hash as string;
  };
};

/** Send native ETH to an address on the given chain. Returns tx hash. */
export function useWithdraw(chainKey: ChainKey) {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  return async (toAddress: string, amountEth: string): Promise<string> => {
    if (!authenticated || !wallets?.length) {
      throw new Error('No authenticated wallet available.');
    }
    if (isSolanaChain(chainKey)) {
      throw new Error('Withdraw is for EVM only. Solana is not supported.');
    }
    const evmChain = chainKey as EvmChainKey;
    const chainConfig = chainConfigs[evmChain];
    if (!chainConfig) {
      throw new Error('Unsupported chain.');
    }
    const wallet = wallets[0];
    const ethereumProvider = await wallet.getEthereumProvider();
    await ensureEvmChain(ethereumProvider, evmChain);
    const provider = new ethers.BrowserProvider(ethereumProvider);
    const signer = await provider.getSigner();
    const valueWei = ethers.parseEther(amountEth);
    const tx = await signer.sendTransaction({ to: toAddress, value: valueWei });
    await tx.wait();
    return tx.hash as string;
  };
}
