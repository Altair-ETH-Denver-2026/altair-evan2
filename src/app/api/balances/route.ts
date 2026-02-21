import { NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { ACTIVE_CHAIN, CHAINS, type ChainKey } from '../../../../config';
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

    const chainConfig = chainKey && chainKey in CHAINS ? CHAINS[chainKey] : ACTIVE_CHAIN;
    const client = createPublicClient({
      chain: {
        ...baseSepolia,
        id: chainConfig.chainId,
        rpcUrls: { default: { http: [chainConfig.rpcUrl] }, public: { http: [chainConfig.rpcUrl] } },
      },
      transport: http(chainConfig.rpcUrl),
    });

    const ethBalanceRaw = await client.getBalance({ address: addressToQuery });
    const eth = formatEther(ethBalanceRaw);
    let usdc = '0';

    const usdcAddress = chainConfig.usdc;
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
