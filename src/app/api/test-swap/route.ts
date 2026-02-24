import { NextResponse } from 'next/server';
import { BLOCKCHAIN, CHAINS, type ChainKey } from '../../../../config/blockchain_config';
import {
  ARBITRUM_ONE,
  BASE_MAINNET,
  BASE_SEPOLIA,
  ETH_MAINNET,
  ETH_SEPOLIA,
  resolveRpcUrls,
} from '../../../../config/chain_info';
import type { ChainTokens } from '../../../../config/token_info/types';
import { BASE_MAINNET_TOKENS } from '../../../../config/token_info/base_tokens';
import { BASE_SEPOLIA_TOKENS } from '../../../../config/token_info/base_testnet_sepolia_tokens';
import { ETH_MAINNET_TOKENS } from '../../../../config/token_info/eth_tokens';
import { ETH_SEPOLIA_TOKENS } from '../../../../config/token_info/eth_sepolia_testnet_tokens';
import { ARBITRUM_ONE_TOKENS } from '../../../../config/token_info/arbitrum_tokens';

function applyTokenEnvOverrides(chainKey: ChainKey, tokens: ChainTokens): ChainTokens {
  const out = { ...tokens };
  for (const symbol of Object.keys(out)) {
    const envKey = `${chainKey}_${symbol}_ADDRESS`;
    const addr = process.env[envKey];
    if (addr) out[symbol] = { ...out[symbol], address: addr };
  }
  return out;
}

const chainConfigs = {
  BASE_SEPOLIA,
  ETH_SEPOLIA,
  ETH_MAINNET,
  BASE_MAINNET,
  ARBITRUM_ONE,
} as const;

const tokenMaps: Record<keyof typeof chainConfigs, ChainTokens> = {
  BASE_SEPOLIA: BASE_SEPOLIA_TOKENS,
  ETH_SEPOLIA: ETH_SEPOLIA_TOKENS,
  ETH_MAINNET: ETH_MAINNET_TOKENS,
  BASE_MAINNET: BASE_MAINNET_TOKENS,
  ARBITRUM_ONE: ARBITRUM_ONE_TOKENS,
};

/** 0x Swap API v2 requires an address for native ETH; this is the standard sentinel (see 0x docs / ERC-7528). */
const NATIVE_ETH_ADDRESS = '0xEeeeeEeeeEeeeEeeeEeeeEeeeEeEeeEeEeEeEeEeeEeEe';

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

    const chainConfig = chainConfigs[resolvedChainKey as keyof typeof chainConfigs];
    if (!chainConfig) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    let tokenConfig = tokenMaps[resolvedChainKey as keyof typeof tokenMaps];
    tokenConfig = applyTokenEnvOverrides(resolvedChainKey, tokenConfig);

    if (!amount || !recipient) {
      return NextResponse.json({ error: 'Missing amount or recipient' }, { status: 400 });
    }

    const normalizedBuyToken = buyToken?.toUpperCase();
    const normalizedSellToken = sellToken?.toUpperCase();
    if (!normalizedBuyToken || !normalizedSellToken) {
      return NextResponse.json({ error: 'Missing buy or sell token' }, { status: 400 });
    }

    const supportedSell = normalizedSellToken === 'ETH' || tokenConfig[normalizedSellToken];
    const supportedBuy = !!tokenConfig[normalizedBuyToken] || normalizedBuyToken === 'ETH';
    if (!supportedSell || !supportedBuy) {
      return NextResponse.json(
        {
          error: `Unsupported token pair. Sell must be ETH or one of: ${Object.keys(tokenConfig).join(', ')}. Buy must be ETH or one of: ${Object.keys(tokenConfig).join(', ')}.`,
        },
        { status: 400 }
      );
    }

    // Amount: treat as human-readable; convert to raw using sell token decimals (0x expects sellAmount in smallest units)
    const sellTokenInfo = normalizedSellToken === 'ETH' ? null : tokenConfig[normalizedSellToken];
    const decimals = sellTokenInfo?.decimals ?? 18;
    const amountHuman = Number(amount);
    const rawAmount = BigInt(Math.floor(amountHuman * 10 ** decimals));
    const sellAmountRaw = rawAmount.toString();

    const zeroXApiKey = process.env.ZEROX_API_KEY;
    const chainId = chainConfig.chainId;

    // 0x v2 does not support testnets (chainId 11155111 / 84532). Use v1 chain-specific endpoints for testnets.
    const v1TestnetEndpoints: Partial<Record<ChainKey, string>> = {
      ETH_SEPOLIA: 'https://sepolia.api.0x.org/swap/v1/quote',
      BASE_SEPOLIA: 'https://base-sepolia.api.0x.org/swap/v1/quote',
    };
    const v1Endpoint = v1TestnetEndpoints[resolvedChainKey];
    // v1 accepts "ETH" string for native; v2 requires the sentinel address (0xEee...)
    const nativeTokenParam = v1Endpoint ? 'ETH' : NATIVE_ETH_ADDRESS;
    const zeroXSellToken = normalizedSellToken === 'ETH' ? nativeTokenParam : tokenConfig[normalizedSellToken].address;
    const zeroXBuyToken = normalizedBuyToken === 'ETH' ? nativeTokenParam : tokenConfig[normalizedBuyToken].address;
    let methodParameters: { to: string; calldata: string; value: string };

    if (v1Endpoint) {
      const v1Url = new URL(v1Endpoint);
      v1Url.searchParams.set('sellToken', zeroXSellToken);
      v1Url.searchParams.set('buyToken', zeroXBuyToken);
      v1Url.searchParams.set('sellAmount', sellAmountRaw);
      v1Url.searchParams.set('takerAddress', recipient);
      v1Url.searchParams.set('slippagePercentage', '0.005');
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (zeroXApiKey) headers['0x-api-key'] = zeroXApiKey;
      const v1Res = await fetch(v1Url.toString(), { headers, method: 'GET' });
      if (!v1Res.ok) {
        const errText = await v1Res.text();
        let msg = errText;
        try {
          const errJson = JSON.parse(errText) as { message?: string };
          if (errJson?.message?.toLowerCase().includes('no route')) {
            msg = `No swap route on ${resolvedChainKey} (0x may have limited testnet liquidity). Try a small amount or another chain.`;
          }
        } catch {
          // keep msg
        }
        return NextResponse.json({ error: `0x ${resolvedChainKey} quote failed: ${msg}` }, { status: 500 });
      }
      const v1Payload = (await v1Res.json()) as { to?: string; data?: string; value?: string };
      if (!v1Payload?.to || !v1Payload?.data || v1Payload?.value === undefined) {
        return NextResponse.json({ error: `0x ${resolvedChainKey} response missing to/data/value` }, { status: 500 });
      }
      methodParameters = { to: v1Payload.to, calldata: v1Payload.data, value: v1Payload.value };
    } else {
      // 0x Swap API v2 for mainnets (Base, Ethereum, Arbitrum, etc.)
      if (!zeroXApiKey) {
        return NextResponse.json(
          { error: 'ZEROX_API_KEY is required for 0x Swap API v2 (mainnet). Set it in .env and restart the server.' },
          { status: 500 }
        );
      }
      const v2Url = new URL('https://api.0x.org/swap/allowance-holder/quote');
      v2Url.searchParams.set('chainId', String(chainId));
      v2Url.searchParams.set('sellToken', zeroXSellToken);
      v2Url.searchParams.set('buyToken', zeroXBuyToken);
      v2Url.searchParams.set('sellAmount', sellAmountRaw);
      v2Url.searchParams.set('taker', recipient);
      v2Url.searchParams.set('slippageBps', '50');

      const v2Res = await fetch(v2Url.toString(), {
        headers: {
          Accept: 'application/json',
          '0x-api-key': zeroXApiKey,
          '0x-version': 'v2',
        },
        method: 'GET',
      });

      if (!v2Res.ok) {
        const errText = await v2Res.text();
        let userMessage = `0x quote failed: ${errText}`;
        try {
          const errJson = JSON.parse(errText) as { message?: string };
          if (errJson?.message?.toLowerCase().includes('no route')) {
            userMessage = `No swap route for ${normalizedSellToken}/${normalizedBuyToken} on ${resolvedChainKey}. Check chain and token addresses.`;
          }
        } catch {
          // keep userMessage
        }
        return NextResponse.json({ error: userMessage }, { status: 500 });
      }

      const v2Payload = (await v2Res.json()) as {
        liquidityAvailable?: boolean;
        transaction?: { to: string; data: string; value: string; gas?: string };
      };
      if (v2Payload.liquidityAvailable === false || !v2Payload.transaction) {
        return NextResponse.json(
          { error: `No liquidity for ${normalizedSellToken}/${normalizedBuyToken} on chain ${chainId}.` },
          { status: 500 }
        );
      }
      const tx = v2Payload.transaction;
      if (!tx.to || !tx.data || tx.value === undefined) {
        return NextResponse.json({ error: '0x quote response missing transaction fields' }, { status: 500 });
      }
      methodParameters = { to: tx.to, calldata: tx.data, value: tx.value };
    }

    return NextResponse.json({
      methodParameters,
      source: '0x',
      chainRpcCandidates: resolveRpcUrls(chainConfig.rpcUrls),
      sellTokenAddress: normalizedSellToken === 'ETH' ? undefined : tokenConfig[normalizedSellToken].address,
    });
  } catch (error) {
    console.error('Test swap error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
