import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { archiveTo0g } from '@/lib/zg-storage';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();

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

    // STEP 3: THE ARCHIVAL
    const archive = await archiveTo0g({
      user_prompt: message,
      ai_interpretation: aiResponse,
    });

    return NextResponse.json({ 
      content: aiResponse,
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
