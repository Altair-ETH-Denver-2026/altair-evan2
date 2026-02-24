import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchUserBalanceForChain } from '@/lib/fetch-user-balance';
import type { ChainKey } from '../../../../../config/blockchain_config';

const CHAINS_TO_CHECK: ChainKey[] = [
  'SOLANA_MAINNET',
  'BASE_MAINNET',
  'ETH_MAINNET',
  'ARBITRUM_ONE',
];

export type PositiveBalanceEntry = { chain: string; token: string; balance: string };

/**
 * GET or POST: returns only tokens with positive balance across Solana, Base, Ethereum, Arbitrum.
 * Auth: privy-token cookie or body accessToken.
 */
function parseChainsParam(q: string | null): ChainKey[] | undefined {
  if (!q?.trim()) return undefined;
  const keys = q.split(',').map((s) => s.trim().toUpperCase());
  const valid: ChainKey[] = [];
  for (const k of keys) {
    if (k === 'ETH_MAINNET' || k === 'BASE_MAINNET' || k === 'ARBITRUM_ONE' || k === 'SOLANA_MAINNET') valid.push(k as ChainKey);
  }
  return valid.length ? valid : undefined;
}

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('privy-token')?.value ?? null;
  const url = new URL(req.url);
  const chains = parseChainsParam(url.searchParams.get('chains'));
  return runPositiveBalances(token, chains);
}

export async function POST(req: Request) {
  let token: string | null = null;
  let chains: ChainKey[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    token = (body?.accessToken ?? body?.access_token) ?? null;
    if (body?.chains && Array.isArray(body.chains)) {
      chains = body.chains.filter((c: string) => ['ETH_MAINNET', 'BASE_MAINNET', 'ARBITRUM_ONE', 'SOLANA_MAINNET'].includes(c)) as ChainKey[];
      if (chains.length === 0) chains = undefined;
    } else if (typeof body?.chains === 'string') {
      chains = parseChainsParam(body.chains);
    }
  } catch {
    // no body
  }
  const cookieStore = await cookies();
  token = token ?? cookieStore.get('privy-token')?.value ?? null;
  return runPositiveBalances(token, chains);
}

async function runPositiveBalances(accessToken: string | null, chainsFilter?: ChainKey[]) {
  if (!accessToken?.trim()) {
    return NextResponse.json({ error: 'Missing auth (privy-token cookie or accessToken in body)' }, { status: 401 });
  }

  const chainsToCheck = chainsFilter && chainsFilter.length > 0 ? chainsFilter : CHAINS_TO_CHECK;
  const positive: PositiveBalanceEntry[] = [];

  await Promise.all(
    chainsToCheck.map(async (chain) => {
      const data = await fetchUserBalanceForChain(accessToken, chain);
      if (!data) return;
      const { address: _addr, ...balances } = data;
      for (const [token, balanceStr] of Object.entries(balances)) {
        const n = Number(balanceStr);
        if (Number.isFinite(n) && n > 0) {
          positive.push({ chain, token, balance: balanceStr });
        }
      }
    })
  );

  return NextResponse.json({
    positiveBalances: positive,
    count: positive.length,
  });
}
