import { NextResponse } from 'next/server';
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

    const normalizedBuyToken = buyToken?.toUpperCase();
    const normalizedSellToken = sellToken?.toUpperCase();
    if (!normalizedBuyToken || !normalizedSellToken) {
      return NextResponse.json({ error: 'Missing buy token' }, { status: 400 });
    }

    const supportedBuy = normalizedBuyToken === 'WETH' || normalizedBuyToken === 'USDC';
    const supportedSell = normalizedSellToken === 'ETH' || normalizedSellToken === 'WETH';
    if (!supportedBuy || !supportedSell) {
      return NextResponse.json({ error: 'Unsupported token pair' }, { status: 400 });
    }

    const zeroXEndpoints: Partial<Record<ChainKey, string>> = {
      ETH_MAINNET: 'https://api.0x.org/swap/v1/quote',
      ETH_SEPOLIA: 'https://sepolia.api.0x.org/swap/v1/quote',
      BASE_MAINNET: 'https://base.api.0x.org/swap/v1/quote',
      BASE_SEPOLIA: 'https://base-sepolia.api.0x.org/swap/v1/quote',
    };

    const zeroXEndpoint = zeroXEndpoints[resolvedChainKey];
    const zeroXApiKey = process.env.ZEROX_API_KEY;
    const zeroXSellToken = normalizedSellToken === 'ETH' ? 'ETH' : tokenConfig.WETH.address;
    const zeroXBuyToken = normalizedBuyToken === 'WETH' ? tokenConfig.WETH.address : tokenConfig.USDC.address;

    if (!zeroXEndpoint) {
      return NextResponse.json({ error: `No quote backend for chain ${resolvedChainKey}` }, { status: 400 });
    }

    const zeroXUrl = new URL(zeroXEndpoint);
    zeroXUrl.searchParams.set('sellToken', zeroXSellToken);
    zeroXUrl.searchParams.set('buyToken', zeroXBuyToken);
    zeroXUrl.searchParams.set('sellAmount', amount);
    zeroXUrl.searchParams.set('takerAddress', recipient);
    zeroXUrl.searchParams.set('slippagePercentage', '0.005');

    const zeroXResponse = await fetch(zeroXUrl, {
      headers: {
        Accept: 'application/json',
        ...(zeroXApiKey ? { '0x-api-key': zeroXApiKey } : {}),
      },
      method: 'GET',
    });

    if (!zeroXResponse.ok) {
      const errText = await zeroXResponse.text();
      return NextResponse.json({ error: `0x quote failed: ${errText}` }, { status: 500 });
    }

    const zeroXPayload = (await zeroXResponse.json()) as {
      to?: string;
      data?: string;
      value?: string;
    };
    if (!zeroXPayload?.to || !zeroXPayload?.data || zeroXPayload?.value === undefined) {
      return NextResponse.json({ error: '0x quote response missing method params' }, { status: 500 });
    }

    return NextResponse.json({
      methodParameters: {
        to: zeroXPayload.to,
        calldata: zeroXPayload.data,
        value: zeroXPayload.value,
      },
      source: '0x',
      chainRpcCandidates: resolveRpcUrls(chainConfig.rpcUrls),
    });
  } catch (error) {
    console.error('Test swap error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
