import { NextResponse } from 'next/server';
import {
  compactMemoryForPrompt,
  getUserMemory,
  parseMemoryValue,
  saveUserMemory,
} from '@/lib/zg-storage';

/**
 * E2E check: write chat_summary_latest, read it back, and return the compact
 * context that would be injected into the chat system prompt.
 * Verifies the inference+storage pipeline (same flow as /api/chat pre-read/inject).
 */
const TEST_WALLET = '0xA7b35a68E8Dcaf78624896372b3B20ba1654E5D5';
const KEY = 'chat_summary_latest';

export async function GET() {
  try {
    const userId = `did:test:e2e:${Date.now()}`;
    const testSummary = {
      schemaVersion: 'v2',
      updatedAt: new Date().toISOString(),
      recentTurns: [
        {
          userMessage: 'I prefer low risk and small amounts.',
          assistantReply: 'Noted. I will suggest conservative swaps.',
          hadSwapExecution: false,
          updatedAt: new Date().toISOString(),
        },
      ],
      swapContext: {
        lastSwapPair: null,
        lastSwapAmount: null,
        lastSwapTxHash: null,
        updatedAt: null,
      },
    };

    const write = await saveUserMemory({
      key: KEY,
      value: JSON.stringify(testSummary),
      walletAddressOverride: TEST_WALLET,
      userIdOverride: userId,
    });

    const read = await getUserMemory({
      key: KEY,
      walletAddressOverride: TEST_WALLET,
      userIdOverride: userId,
    });

    const parsed = parseMemoryValue(read.value ?? undefined);
    const storedChatContext = parsed ? compactMemoryForPrompt(parsed) : null;

    return NextResponse.json({
      ok: true,
      key: KEY,
      userId,
      walletAddress: TEST_WALLET.toLowerCase(),
      write,
      read: {
        status: read.status,
        backend: read.backend,
        value: read.value,
        rootHash: read.rootHash,
        transactionHash: read.transactionHash,
      },
      storedChatContext,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'E2E test error',
      },
      { status: 500 }
    );
  }
}
