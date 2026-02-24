import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { compactMemoryForPrompt, getUserMemory, parseMemoryValue, saveUserMemory } from '@/lib/zg-storage';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

function truncateText(text: string, max = 240): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildUpdatedChatSummary(
  prevMemory: Record<string, unknown> | null,
  userMessage: string,
  assistantReply: string
): Record<string, unknown> {
  const previousTurnsRaw = Array.isArray(prevMemory?.recentTurns)
    ? (prevMemory?.recentTurns as unknown[])
    : [];
  const previousTurns = previousTurnsRaw
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const turn = t as Record<string, unknown>;
      return {
        userMessage: typeof turn.userMessage === 'string' ? turn.userMessage : '',
        assistantReply: typeof turn.assistantReply === 'string' ? turn.assistantReply : '',
        hadSwapExecution: Boolean(turn.hadSwapExecution),
        updatedAt: typeof turn.updatedAt === 'string' ? turn.updatedAt : new Date().toISOString(),
      };
    });

  const nextTurn = {
    userMessage: truncateText(userMessage, 260),
    assistantReply: truncateText(assistantReply, 340),
    hadSwapExecution: false,
    updatedAt: new Date().toISOString(),
  };

  return {
    schemaVersion: 'v2',
    updatedAt: new Date().toISOString(),
    recentTurns: [...previousTurns, nextTurn].slice(-3),
    swapContext:
      prevMemory?.swapContext && typeof prevMemory.swapContext === 'object'
        ? (prevMemory.swapContext as Record<string, unknown>)
        : {
            lastSwapPair: null,
            lastSwapAmount: null,
            lastSwapTxHash: null,
            updatedAt: null,
          },
  };
}

export async function POST(req: Request) {
  try {
    const { message, history, accessToken } = await req.json();

    let zgHash: string | null = null;
    let zgError: string | null = null;
    let priorMemory: Record<string, unknown> | null = null;

    // Pre-read latest user-scoped memory and inject compact context into the system prompt.
    if (typeof accessToken === 'string' && accessToken.length > 0) {
      try {
        const read = await getUserMemory({ key: 'chat_summary_latest', accessToken });
        priorMemory = parseMemoryValue(read.value);
      } catch (readErr) {
        console.warn('0G pre-read memory failed:', readErr);
      }
    }

    const memoryContextForPrompt = priorMemory ? compactMemoryForPrompt(priorMemory) : null;
    const memoryBlock = memoryContextForPrompt
      ? `\nUser Memory Context (from prior chats; may be stale):\n${JSON.stringify(memoryContextForPrompt)}`
      : '\nUser Memory Context: none available yet.';

    const systemPrompt = `
      You are Altair, a DeFi concierge on the Base network.
      Identify: Sell Token, Buy Token, and Amount.
      If info is missing, ask.

      If you are ready to execute, ask the user for confirmation and include an estimated amount of the buy token they would receive (label it as an estimate). Example:
      "You are about to swap 0.1 ETH for USDC. Estimated receive: ~180 USDC. Do you confirm?"

      If you only need to signal execution to the app, return JSON:
      { "type": "SWAP_INTENT", "sell": "ETH", "buy": "USDC", "amount": 0.1 }
      
      Use the user memory context as helpful background, but prioritize the latest user message if there is any conflict.
      ${memoryBlock}
    `;

    // Actual OpenAI Call
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
    });

    const aiResponse = response.choices[0].message.content || "";

    const executionNote: string | null = null;

    // Persist summary into user-scoped 0G memory.
    if (typeof accessToken === 'string' && accessToken.length > 0) {
      try {
        const write = await saveUserMemory({
          key: 'chat_summary_latest',
          accessToken,
          value: JSON.stringify(buildUpdatedChatSummary(priorMemory, message, aiResponse)),
        });
        zgHash = write.rootHash ?? null;
        if (write.backend === 'local_file' && write.error) {
          zgError = write.error;
        }
      } catch (saveErr) {
        zgError = saveErr instanceof Error ? saveErr.message : 'Failed to save memory to 0G';
      }
    }

    return NextResponse.json({ 
      content: executionNote ? `${executionNote}\n\n${aiResponse}` : aiResponse,
      zgHash,
      txHash: zgHash,
      zgError,
    });

  } catch (error) {
    console.error('Chat Error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
