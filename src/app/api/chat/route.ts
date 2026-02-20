import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { archiveTo0g } from '@/lib/zg-storage';
import { initAgentKit, executeSwap } from '@/lib/agentkit';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export async function POST(req: Request) {
  try {
    const { message, history, accessToken } = await req.json();

    const systemPrompt = `
      You are Altair, a DeFi concierge on the Base network. 
      Identify: Sell Token, Buy Token, and Amount.
      If info is missing, ask. If ready, return JSON:
      { "type": "SWAP_INTENT", "sell": "ETH", "buy": "USDC", "amount": 0.1 }
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

    let executionNote: string | null = null;

    // Attempt to execute swap intent using AgentKit + Privy smart wallet (only if JSON-like)
    const trimmed = aiResponse.trim();
    const looksLikeJson = trimmed.startsWith('{') && trimmed.endsWith('}');
    if (looksLikeJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.type === 'SWAP_INTENT') {
          if (!accessToken) {
            throw new Error('Missing Privy access token');
          }

          const agentKit = await initAgentKit({
            baseRpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org',
            accessToken,
          });

          await executeSwap(agentKit, {
            sellToken: parsed.sell,
            buyToken: parsed.buy,
            amount: parsed.amount,
          });

          executionNote = `Swap submitted: ${parsed.amount} ${parsed.sell} -> ${parsed.buy} on Base Sepolia.`;
        }
      } catch (intentErr) {
        // If parsing fails, we just return the AI text; log server-side
        console.warn('Swap intent parse/exec skipped:', intentErr);
      }
    }

    // STEP 3: THE ARCHIVAL
    const archive = await archiveTo0g({
      user_prompt: message,
      ai_interpretation: aiResponse,
      executed: executionNote,
    });

    return NextResponse.json({ 
      content: executionNote ? `${executionNote}\n\n${aiResponse}` : aiResponse,
      zgHash: archive.rootHash,
      txHash: archive.txHash,
      zgError: archive.error ?? null,
    });

  } catch (error) {
    console.error('Chat Error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
