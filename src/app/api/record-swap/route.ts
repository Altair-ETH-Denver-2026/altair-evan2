import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { appendSwapToHistory } from '@/lib/zg-storage';
import { CHAINS, type ChainKey } from '../../../../config/blockchain_config';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      accessToken: bodyToken,
      chain,
      sellToken,
      buyToken,
      sellAmount,
      txHash,
    } = (body || {}) as {
      accessToken?: string;
      chain?: string;
      sellToken?: string;
      buyToken?: string;
      sellAmount?: string;
      txHash?: string;
    };

    const cookieStore = await cookies();
    const cookieToken = cookieStore.get('privy-token')?.value;
    const accessToken =
      (cookieToken ?? bodyToken) && String(cookieToken ?? bodyToken).trim()
        ? String(cookieToken ?? bodyToken)
        : null;

    if (!txHash || !chain || !sellToken || !buyToken || sellAmount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: chain, sellToken, buyToken, sellAmount, txHash' },
        { status: 400 }
      );
    }

    const chainKey = chain in CHAINS ? chain : null;
    if (!chainKey) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    const result = await appendSwapToHistory({
      accessToken,
      chain: chainKey as ChainKey,
      sellToken: String(sellToken),
      buyToken: String(buyToken),
      sellAmount: String(sellAmount),
      txHash: String(txHash),
    });

    return NextResponse.json({
      ok: true,
      backend: result.backend,
      error: result.error ?? undefined,
    });
  } catch (error) {
    console.error('Record swap error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
