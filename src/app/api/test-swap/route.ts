import { NextResponse } from 'next/server';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import { BLOCKCHAIN, CHAINS, type ChainKey } from '../../../../config/blockchain_config';
import { BASE_MAINNET, BASE_SEPOLIA, ETH_MAINNET, ETH_SEPOLIA, resolveRpcUrls } from '../../../../config/chain_info';
import { USDC as BASE_USDC, WETH as BASE_WETH } from '../../../../config/token_info/base_tokens';
import { USDC as BASE_SEPOLIA_USDC, WETH as BASE_SEPOLIA_WETH } from '../../../../config/token_info/base_testnet_sepolia_tokens';
import { USDC as ETH_USDC, WETH as ETH_WETH } from '../../../../config/token_info/eth_tokens';
import { USDC as ETH_SEPOLIA_USDC, WETH as ETH_SEPOLIA_WETH } from '../../../../config/token_info/eth_sepolia_testnet_tokens';

export async function POST(req: Request) {
  try {
    const { chain: requestedChain, buyToken, sellToken, amount, recipient } = (await req
      .json()
      .catch(() => ({
        chain: null,
        buyToken: null,
        sellToken: null,
        amount: null,
        recipient: null,
      }))) as {
      chain?: ChainKey | null;
      buyToken?: string | null;
      sellToken?: string | null;
      amount?: string | null;
      recipient?: string | null;
    };

    const resolvedChainKey: ChainKey =
      requestedChain && requestedChain in CHAINS ? requestedChain : (BLOCKCHAIN as ChainKey);

    const chainConfigs = {
      BASE_SEPOLIA,
      ETH_SEPOLIA,
      ETH_MAINNET,
      BASE_MAINNET,
    } as const;

    const chainConfig = chainConfigs[resolvedChainKey];
    const tokenConfigs = {
      BASE_SEPOLIA: { USDC: BASE_SEPOLIA_USDC, WETH: BASE_SEPOLIA_WETH },
      ETH_SEPOLIA: { USDC: ETH_SEPOLIA_USDC, WETH: ETH_SEPOLIA_WETH },
      ETH_MAINNET: { USDC: ETH_USDC, WETH: ETH_WETH },
      BASE_MAINNET: { USDC: BASE_USDC, WETH: BASE_WETH },
    } as const;

    const tokenConfig = tokenConfigs[resolvedChainKey];
    if (!chainConfig) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    if (!amount || !recipient) {
      return NextResponse.json({ error: 'Missing amount or recipient' }, { status: 400 });
    }

    const fallbackUrls = (() => {
      switch (chainConfig.chainId) {
        case 8453:
          return [
            'https://mainnet.base.org',
            'https://base.publicnode.com',
            'https://1rpc.io/base',
            'https://base.blockpi.network/v1/rpc/public',
          ];
        case 84532:
          return [
            'https://sepolia.base.org',
            'https://base-sepolia.publicnode.com',
            'https://base-sepolia.blockpi.network/v1/rpc/public',
          ];
        case 1:
          return ['https://cloudflare-eth.com', 'https://rpc.ankr.com/eth'];
        case 11155111:
          return ['https://rpc.sepolia.org', 'https://rpc.ankr.com/eth_sepolia'];
        default:
          return [];
      }
    })();

    const primaryRpcUrls = resolveRpcUrls(chainConfig.rpcUrls);
    const provider = new ethers.providers.FallbackProvider(
      [...primaryRpcUrls, ...fallbackUrls].map(
        (rpcUrl) =>
          new ethers.providers.StaticJsonRpcProvider(rpcUrl, {
            chainId: chainConfig.chainId,
            name: resolvedChainKey.toLowerCase(),
          }),
      ),
      1,
    );
    const router = new AlphaRouter({ chainId: chainConfig.chainId, provider });
    const WETH = new Token(
      chainConfig.chainId,
      tokenConfig.WETH.address,
      18,
      tokenConfig.WETH.symbol,
      tokenConfig.WETH.name,
    );
    const USDC = new Token(
      chainConfig.chainId,
      tokenConfig.USDC.address,
      6,
      tokenConfig.USDC.symbol,
      tokenConfig.USDC.name,
    );

    const normalizedBuyToken = buyToken?.toUpperCase();
    if (!normalizedBuyToken) {
      return NextResponse.json({ error: 'Missing buy token' }, { status: 400 });
    }

    const targetToken = normalizedBuyToken === 'WETH' ? WETH : normalizedBuyToken === 'USDC' ? USDC : null;
    if (!targetToken) {
      return NextResponse.json({ error: 'Unsupported buy token' }, { status: 400 });
    }

    const normalizedSellToken = sellToken?.toUpperCase();
    const sellCurrency = normalizedSellToken === 'ETH' ? Ether.onChain(chainConfig.chainId) : WETH;

    const route = await router.route(
      CurrencyAmount.fromRawAmount(sellCurrency, amount),
      targetToken,
      TradeType.EXACT_INPUT,
      {
        recipient,
        slippageTolerance: new Percent(50, 10_000),
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        type: SwapType.SWAP_ROUTER_02,
      },
    );

    if (!route?.methodParameters) {
      return NextResponse.json({ error: 'No swap route found' }, { status: 500 });
    }

    return NextResponse.json({ methodParameters: route.methodParameters });
  } catch (error) {
    console.error('Test swap error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
