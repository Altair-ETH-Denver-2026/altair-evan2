import { NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getPrivySmartWalletAddress } from '@/lib/privy';
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
    const { walletAddress: overrideAddress } = await req.json().catch(() => ({ walletAddress: undefined }));

    // Try to get the signed Privy ID token from cookie (HTTP-only)
    const cookieStore = await cookies();
    const idToken = cookieStore.get('privy-id-token')?.value;

    // Resolve address: prefer explicit override, then Privy ID token, then env fallback
    let resolvedAddress: string | null = overrideAddress ?? null;

    if (!resolvedAddress && idToken) {
      try {
        const walletAddress = await getPrivySmartWalletAddress(idToken);
        resolvedAddress = walletAddress;
      } catch (e) {
        console.warn('Privy ID token verification failed, falling back to env override if present:', e);
      }
    }

    if (!resolvedAddress) {
      resolvedAddress = process.env.USER_WALLET_FALLBACK ?? process.env.ZEROG_BASE_ADDRESS ?? null;
    }

    if (!resolvedAddress) {
      return NextResponse.json({ error: 'Unable to resolve wallet address' }, { status: 401 });
    }

    const addressToQuery = resolvedAddress as `0x${string}`;

    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org'),
    });

    const ethBalanceRaw = await client.getBalance({ address: addressToQuery });
    const eth = formatEther(ethBalanceRaw);
    let usdc = '0';

    const usdcAddress = process.env.USDC_CONTRACT_BASE_SEPOLIA;
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
