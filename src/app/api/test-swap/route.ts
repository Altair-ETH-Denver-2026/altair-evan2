import { NextResponse } from 'next/server';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import { BLOCKCHAIN, CHAINS, type ChainKey } from '../../../../config';

export async function POST(req: Request) {
  try {
    const { chain: requestedChain, buyToken, amount, recipient } = (await req
      .json()
      .catch(() => ({ chain: null, buyToken: null, amount: null, recipient: null }))) as {
      chain?: ChainKey | null;
      buyToken?: string | null;
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

    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
    const router = new AlphaRouter({ chainId: chainConfig.chainId, provider });
    const WETH = new Token(chainConfig.chainId, chainConfig.weth, 18, 'WETH', 'Wrapped Ether');
    const USDC = new Token(chainConfig.chainId, chainConfig.usdc, 6, 'USDC', 'USD Coin');

    const targetToken = buyToken?.toUpperCase() === 'WETH' ? WETH : USDC;

    const route = await router.route(
      CurrencyAmount.fromRawAmount(WETH, amount),
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
