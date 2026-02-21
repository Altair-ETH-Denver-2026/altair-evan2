import { NextResponse } from 'next/server';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import { BLOCKCHAIN, CHAINS, type ChainKey } from '../../../../config';

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

    const chainConfig = CHAINS[resolvedChainKey];
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

    const provider = new ethers.providers.FallbackProvider(
      [chainConfig.rpcUrl, ...fallbackUrls].map(
        (rpcUrl) =>
          new ethers.providers.StaticJsonRpcProvider(rpcUrl, {
            chainId: chainConfig.chainId,
            name: resolvedChainKey.toLowerCase(),
          }),
      ),
      1,
    );
    const router = new AlphaRouter({ chainId: chainConfig.chainId, provider });
    const WETH = new Token(chainConfig.chainId, chainConfig.weth, 18, 'WETH', 'Wrapped Ether');
    const USDC = new Token(chainConfig.chainId, chainConfig.usdc, 6, 'USDC', 'USD Coin');

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
