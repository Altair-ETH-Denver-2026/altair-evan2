import { AgentKit, PrivyWalletProvider } from '@coinbase/agentkit';
import { getPrivySmartWalletAddress } from './privy';

type InitAgentKitParams = {
  baseRpcUrl: string;
  accessToken: string; // Privy access token from the client
};

/**
 * Initialize AgentKit with the user's Privy smart wallet on Base Sepolia.
 */
export async function initAgentKit({ baseRpcUrl, accessToken }: InitAgentKitParams) {
  if (!process.env.CDP_API_KEY_NAME || !process.env.CDP_API_KEY_SECRET) {
    throw new Error('Missing CDP_API_KEY_NAME or CDP_API_KEY_SECRET environment variables');
  }

  // Resolve the user's smart wallet (Base Sepolia) via Privy
  const smartWalletAddress = await getPrivySmartWalletAddress(accessToken);

  // Configure a Privy-backed wallet provider (EVM server wallet on Base Sepolia)
  const walletProvider = await PrivyWalletProvider.configureWithWallet({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? '',
    appSecret: process.env.PRIVY_APP_SECRET ?? '',
    chainId: '84532',
    rpcUrl: baseRpcUrl,
    walletId: smartWalletAddress,
  });

  const agentKit = await AgentKit.from({
    walletProvider,
    cdpApiKeyId: process.env.CDP_API_KEY_NAME,
    cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
  });

  return agentKit;
}

export type SwapInput = {
  sellToken: string;
  buyToken: string;
  amount: number;
};

/**
 * Execute a swap through the AgentKit actions (CDP-backed swap on Base Sepolia).
 */
export async function executeSwap(agentKit: AgentKit, { sellToken, buyToken, amount }: SwapInput) {
  const actions = agentKit.getActions();
  const swap = actions.find((a) => a.name?.toLowerCase().includes('swap'));
  if (!swap || !swap.invoke) {
    throw new Error('Swap action not available');
  }

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
