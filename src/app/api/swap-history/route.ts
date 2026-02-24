import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSwapHistory, SWAP_HISTORY_KEY } from '@/lib/zg-storage';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || 50), 100);

    const cookieStore = await cookies();
    const cookieToken = cookieStore.get('privy-token')?.value;
    const queryToken = searchParams.get('accessToken');
    const accessToken =
      (cookieToken ?? queryToken) && String(cookieToken ?? queryToken).trim()
        ? String(cookieToken ?? queryToken)
        : null;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Authentication required. Set privy-token cookie or pass accessToken query.' },
        { status: 401 }
      );
    }

    const swaps = await getSwapHistory(
      { key: SWAP_HISTORY_KEY, accessToken },
      limit
    );

    return NextResponse.json({ swaps });
  } catch (error) {
    console.error('Swap history fetch error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
