import { NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { BLOCKCHAIN, CHAINS, type ChainKey } from '../../../../config/blockchain_config';
import { ARBITRUM_ONE, BASE_MAINNET, BASE_SEPOLIA, ETH_MAINNET, ETH_SEPOLIA, resolveRpcUrls } from '../../../../config/chain_info';
import { USDC as BASE_USDC, WETH as BASE_WETH } from '../../../../config/token_info/base_tokens';
import { USDC as BASE_SEPOLIA_USDC, WETH as BASE_SEPOLIA_WETH } from '../../../../config/token_info/base_testnet_sepolia_tokens';
import { USDC as ETH_USDC, WETH as ETH_WETH } from '../../../../config/token_info/eth_tokens';
import { USDC as ETH_SEPOLIA_USDC, WETH as ETH_SEPOLIA_WETH } from '../../../../config/token_info/eth_sepolia_testnet_tokens';
import { USDC as ARBITRUM_USDC, WETH as ARBITRUM_WETH } from '../../../../config/token_info/arbitrum_tokens';
import { getPrivyEvmWalletAddress } from '@/lib/privy';
import { cookies } from 'next/headers';

const USDC_ABI = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export async function POST(req: Request) {
  try {
    const { walletAddress: overrideAddress, chain: chainKey, accessToken: bodyToken } = (await req
      .json()
      .catch(() => ({ walletAddress: undefined, chain: undefined, accessToken: undefined }))) as {
      walletAddress?: string;
      chain?: ChainKey;
      accessToken?: string;
    };

    // Prefer signed Privy token from cookie; fall back to body token, then override address
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get('privy-token')?.value;
    const tokenToVerify = cookieToken ?? bodyToken ?? null;

    const addressToQuery = (overrideAddress
      ?? (tokenToVerify ? await getPrivyEvmWalletAddress(tokenToVerify) : null)) as `0x${string}` | null;

    if (!addressToQuery) {
      return NextResponse.json({ error: 'Unable to resolve wallet address' }, { status: 401 });
    }

    const chainConfigs = {
      BASE_SEPOLIA,
      ETH_SEPOLIA,
      ETH_MAINNET,
      BASE_MAINNET,
      ARBITRUM_ONE,
    } as const;

    const resolvedChainKey: ChainKey =
      chainKey && chainKey in CHAINS ? chainKey : (BLOCKCHAIN as ChainKey);

    const chainConfig = chainConfigs[resolvedChainKey];
    const resolvedRpcUrls = resolveRpcUrls(chainConfig.rpcUrls);
    const primaryRpcUrl = resolvedRpcUrls[0];
    const tokenConfigs = {
      BASE_SEPOLIA: { USDC: BASE_SEPOLIA_USDC, WETH: BASE_SEPOLIA_WETH },
      ETH_SEPOLIA: { USDC: ETH_SEPOLIA_USDC, WETH: ETH_SEPOLIA_WETH },
      ETH_MAINNET: { USDC: ETH_USDC, WETH: ETH_WETH },
      BASE_MAINNET: { USDC: BASE_USDC, WETH: BASE_WETH },
      ARBITRUM_ONE: { USDC: ARBITRUM_USDC, WETH: ARBITRUM_WETH },
    } as const;

    const tokenConfig = tokenConfigs[resolvedChainKey];
    const client = createPublicClient({
      chain: {
        ...baseSepolia,
        id: chainConfig.chainId,
        rpcUrls: { default: { http: resolvedRpcUrls }, public: { http: resolvedRpcUrls } },
      },
      transport: http(primaryRpcUrl),
    });

    const ethBalanceRaw = await client.getBalance({ address: addressToQuery });
    const eth = formatEther(ethBalanceRaw);
    let usdc = '0';

    const usdcAddress = tokenConfig?.USDC?.address;
    if (usdcAddress) {
      try {
        const [decimals, usdcBalanceRaw] = await Promise.all([
          client.readContract({
            address: usdcAddress as `0x${string}`,
            abi: USDC_ABI,
            functionName: 'decimals',
          }),
          client.readContract({
            address: usdcAddress as `0x${string}`,
            abi: USDC_ABI,
            functionName: 'balanceOf',
            args: [addressToQuery],
          }),
        ]);

        usdc = formatUnits(usdcBalanceRaw, Number(decimals));
      } catch (erc20Err) {
        console.warn('USDC balance fetch failed, returning 0:', erc20Err);
        usdc = '0';
      }
    }

    console.log('addressToQuery', addressToQuery);

    return NextResponse.json({
      address: addressToQuery,
      eth,
      usdc,
    });
  } catch (error) {
    console.error('Balance fetch error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
