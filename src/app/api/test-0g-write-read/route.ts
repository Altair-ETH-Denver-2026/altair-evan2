import { NextResponse } from 'next/server';
import { getUserMemory, saveUserMemory } from '@/lib/zg-storage';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken : null;
    const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress : null;
    const userId = typeof body.userId === 'string' ? body.userId : null;

    const key = typeof body.key === 'string' ? body.key : 'chat_summary_latest';
    const value =
      typeof body.value === 'string'
        ? body.value
        : JSON.stringify({
            schemaVersion: 'v2',
            updatedAt: new Date().toISOString(),
            recentTurns: [
              {
                userMessage: 'test write',
                assistantReply: 'test read',
                hadSwapExecution: false,
                updatedAt: new Date().toISOString(),
              },
            ],
            swapContext: null,
          });

    const write = await saveUserMemory({
      key,
      value,
      accessToken,
      walletAddressOverride: walletAddress,
      userIdOverride: userId,
    });

    const read = await getUserMemory({
      key,
      accessToken,
      walletAddressOverride: walletAddress,
      userIdOverride: userId,
    });

    return NextResponse.json({
      ok: true,
      key,
      write,
      read,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown write/read error',
      },
      { status: 500 }
    );
  }
}
