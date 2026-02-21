import {
  AgentKit,
  PrivyWalletProvider,
  walletActionProvider,
  erc20ActionProvider,
  zeroXActionProvider,
  sushiRouterActionProvider,
} from '@coinbase/agentkit';
import { isAddress, parseEther } from 'viem';
import { ensurePrivyEmbeddedEvmWallet } from './privy';
import { ACTIVE_CHAIN } from '@/../config';

const BASE_SEPOLIA_WETH = ACTIVE_CHAIN.weth;
const BASE_SEPOLIA_USDC = ACTIVE_CHAIN.usdc;

type InitAgentKitParams = {
  baseRpcUrl: string;
  accessToken: string; // Privy access token from the client
};

/**
 * Initialize AgentKit with the user's Privy smart wallet on Base Sepolia.
 */
export async function initAgentKit({ baseRpcUrl, accessToken }: InitAgentKitParams) {
  // Resolve or create a Privy-controlled embedded EVM wallet (required for server signing)
  const { walletId } = await ensurePrivyEmbeddedEvmWallet(accessToken);

  // Configure a Privy-backed wallet provider (EVM server wallet on Base Sepolia)
  const walletProvider = await PrivyWalletProvider.configureWithWallet({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? '',
    appSecret: process.env.PRIVY_APP_SECRET ?? '',
    chainId: '84532',
    rpcUrl: baseRpcUrl,
    walletId,
  });

  const agentKit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      walletActionProvider(),
      erc20ActionProvider(),
      // Prefer Uniswap-compatible routing via Sushi router; fall back to 0x if needed
      sushiRouterActionProvider(),
      zeroXActionProvider({ apiKey: process.env.ZEROX_API_KEY ?? '' }),
    ],
  });

  return agentKit;
}

export type SwapInput = {
  sellToken: string;
  buyToken: string;
  amount: number | string;
};

/**
 * Execute a swap through the AgentKit actions (0x-backed swap on Base Sepolia).
 */
export async function executeSwap(agentKit: AgentKit, { sellToken, buyToken, amount }: SwapInput) {
  const actions = agentKit.getActions();
  console.log('[AgentKit] available actions:', actions.map((a) => a.name));

  const preferredOrder = ['sushi', 'uniswap', 'uni', '0x', 'swap'];
  const swap = actions.find((a) => {
    const name = a.name?.toLowerCase() ?? '';
    return preferredOrder.some((p) => name.includes(p));
  });

  if (!swap || !swap.invoke) {
    throw new Error('Swap action not available');
  }

  const name = swap.name?.toLowerCase() ?? '';

  // If using 0x provider, conform to its schema (sellAmount as wei string)
  if (name.includes('0x')) {
    const normalizeToken = (token: string) => {
      const t = token.toLowerCase();
      if (t === 'eth') return 'ETH';
      if (t === 'weth') return BASE_SEPOLIA_WETH;
      if (t === 'usdc') return BASE_SEPOLIA_USDC;
      return token;
    };

    const isNativeSell = sellToken.toLowerCase() === 'eth';
    const sellTokenAddr = normalizeToken(sellToken);
    const buyTokenAddr = normalizeToken(buyToken);

    if (!isAddress(sellTokenAddr) || !isAddress(buyTokenAddr)) {
      throw new Error(`Invalid token address for swap. sellToken=${sellTokenAddr}, buyToken=${buyTokenAddr}`);
    }

    const amountStr = typeof amount === 'string' ? amount : amount.toString();
    const sellAmountWei = parseEther(amountStr).toString();
    const result = await swap.invoke({
      sellToken: sellTokenAddr,
      buyToken: buyTokenAddr,
      sellAmount: sellAmountWei,
      slippageBps: 100, // 1%
      swapFeeBps: 0,
      // Allow native ETH input when sell token is ETH; the 0x provider handles wrapping internally
      sourceToken: isNativeSell ? 'ETH' : undefined,
    });
    return result;
  }

  // Generic fallback (e.g., sushi/uniswap routers)
  const result = await swap.invoke({
    fromToken: sellToken,
    toToken: buyToken,
    amount,
    chainId: 'base-sepolia',
  } as {
    fromToken: string;
    toToken: string;
    amount: number;
    chainId: string;
  });

  return result;
}

