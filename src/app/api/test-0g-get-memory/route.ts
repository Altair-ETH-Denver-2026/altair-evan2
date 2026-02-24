import { NextResponse } from 'next/server';
import { getUserMemory } from '@/lib/zg-storage';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = typeof body.key === 'string' ? body.key : 'chat_summary_latest';
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken : null;
    const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress : null;
    const userId = typeof body.userId === 'string' ? body.userId : null;

    const read = await getUserMemory({
      key,
      accessToken,
      walletAddressOverride: walletAddress,
      userIdOverride: userId,
    });

    return NextResponse.json({ ok: true, key, read });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown read error',
      },
      { status: 500 }
    );
  }
}
