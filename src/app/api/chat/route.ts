import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { fetchUserBalanceForChain } from '@/lib/fetch-user-balance';
import {
  compactMemoryForPrompt,
  getSwapHistory,
  getUserMemory,
  parseMemoryValue,
  saveUserMemory,
  SWAP_HISTORY_KEY,
} from '@/lib/zg-storage';
import { BLOCKCHAIN, CHAINS, type ChainKey } from '../../../../config/blockchain_config';

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

const BASE_PROMPT = `You are Altair, a DeFi concierge with personality: fun, sassy, and informative. You help users on Solana, Base, Ethereum, and Arbitrum.

## Personality & tone
- Be warm and a little cheeky; light humor is welcome. Never mean or condescending.
- Stay informative: explain the "why" in plain language when it helps, but keep replies concise (a few short paragraphs max unless the user asks for detail).
- If someone's request is vague, ask one or two quick questions instead of over-explaining.

## Rules & constraints
- Stay on topic: swaps, staking, yield, and general DeFi on supported chains. Gently deflect off-topic or inappropriate requests.
- Do not give regulated financial, tax, or legal advice. You can explain how products work and compare options; do not recommend specific investments or promise returns.
- Never pretend to perform actions you cannot do. You can guide users to swap (and the app can execute swaps); for staking and yield you inform and point to options rather than execute.
- Do not make up token prices, APYs, or contract addresses. If you don't know, say so or give a rough "check your wallet or explorer" style nudge.
- Keep user safety in mind: remind about testnets for trying things, and that they should verify addresses and amounts.

## Parameters (what you can do)
- Swaps: You can help users swap tokens. When you have sell token, buy token, and amount, and the user confirms, you MUST return exactly the following JSON so the app can execute (no extra text before/after the JSON when signaling execution):
  {"type":"SWAP_INTENT","sell":"ETH","buy":"USDC","amount":0.1}
  Supported sell: ETH, WETH, USDC, USDT, DAI. Supported buy: ETH, WETH, USDC, USDT, DAI (e.g. sell USDC for ETH).
- Before executing a swap: ask for confirmation and include an estimated receive amount (label it as an estimate). Example: "You're about to swap 0.1 ETH for USDC. Estimated receive: ~180 USDC. Confirm?"
- Staking & yield: Explain what staking and yield are, and that the app supports swaps on-chain; for staking/yield you can describe options (e.g. staking ETH, yield-bearing tokens) and suggest they check the app or docs for current offerings.
- If swap details are missing (token, amount, or chain), ask for the missing piece briefly.`;

const SOLANA_SWAP_BLOCK = `
## Current network: Solana mainnet
- The user has selected **Solana mainnet**. You MUST help them swap on Solana.
- On Solana, supported tokens are: **SOL** (native), **USDC**, **JUP**, **RAY**, **KMNO**, **DRIFT**, **W**. Supported sell and buy: any of these.
- When the user confirms a Solana swap, return exactly this JSON (no extra text): {"type":"SWAP_INTENT","sell":"<symbol>","buy":"<symbol>","amount":<number>} (e.g. sell SOL buy USDC, or sell JUP buy SOL).
- Do NOT say you only support ETH/WETH/USDC/USDT/DAI when the user is on Solana—you support SOL, USDC, JUP, RAY, KMNO, DRIFT, W on Solana.`;

const EVM_SWAP_BLOCK = `
## Current network: EVM (Base / Ethereum / Arbitrum)
- Supported swap tokens: ETH, WETH, USDC, USDT, DAI. Use SWAP_INTENT with those symbols.`;

function buildSystemPrompt(
  memoryBlock: string,
  swapHistoryBlock: string,
  selectedChain?: string | null,
  balanceBlock?: string | null
): string {
  const chainBlock =
    selectedChain === 'SOLANA_MAINNET' ? SOLANA_SWAP_BLOCK : EVM_SWAP_BLOCK;
  const balanceSection = balanceBlock
    ? `\n## User wallet balances (portfolio — all chains)\nYou have access to the user's Privy wallets across Solana, Base, Ethereum, and Arbitrum mainnets. Use the data below when the user asks for their balance, "portfolio", "combined balance", "sell all" of a token, or how much they hold on any chain. You can summarize per chain or give a combined token view (e.g. total USDC across chains). Do not say you cannot see their wallet—you have full portfolio access.\n${balanceBlock}\n`
    : '';
  return `${BASE_PROMPT}
${chainBlock}
${balanceSection}
## Context (use as background; prefer the latest user message if anything conflicts)
${memoryBlock}
${swapHistoryBlock}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { message, history, accessToken: bodyToken, selectedChain } = (body || {}) as {
      message?: string;
      history?: Array<{ role: string; content: string }>;
      accessToken?: string;
      selectedChain?: string | null;
    };
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get('privy-token')?.value;
    const accessToken =
      (cookieToken ?? bodyToken) && String(cookieToken ?? bodyToken).trim()
        ? String(cookieToken ?? bodyToken)
        : null;

    let zgHash: string | null = null;
    let zgError: string | null = null;
    let priorMemory: Record<string, unknown> | null = null;

    // Pre-read latest user-scoped memory and inject compact context into the system prompt.
    if (accessToken) {
      try {
        const read = await getUserMemory({ key: 'chat_summary_latest', accessToken });
        priorMemory = parseMemoryValue(read.value);
        console.log('[0G] Pre-read memory ok', {
          status: read.status,
          backend: read.backend,
          hasValue: !!read.value,
          namespace: read.namespace,
        });
      } catch (readErr) {
        console.warn('0G pre-read memory failed:', readErr);
      }
    }

    const memoryContextForPrompt = priorMemory ? compactMemoryForPrompt(priorMemory) : null;
    const memoryBlock = memoryContextForPrompt
      ? `\nUser Memory Context (from prior chats; may be stale):\n${JSON.stringify(memoryContextForPrompt)}`
      : '\nUser Memory Context: none available yet.';

    let swapHistoryBlock = '\nSwap history: none.';
    if (accessToken) {
      try {
        const swapHistory = await getSwapHistory(
          { key: SWAP_HISTORY_KEY, accessToken },
          10
        );
        if (swapHistory.length > 0) {
          swapHistoryBlock = `\nUser swap history (last ${swapHistory.length}):\n${JSON.stringify(swapHistory.map((s) => ({ chain: s.chain, sell: s.sellToken, buy: s.buyToken, amount: s.sellAmount, txHash: s.txHash, at: s.timestamp })))}`;
          console.log('[0G] Swap history for prompt', { count: swapHistory.length });
        }
      } catch (swapErr) {
        console.warn('[0G] Swap history read failed:', swapErr);
      }
    }

    const PORTFOLIO_CHAINS: ChainKey[] = ['SOLANA_MAINNET', 'BASE_MAINNET', 'ETH_MAINNET', 'ARBITRUM_ONE'];
    let balanceBlock: string | null = null;
    if (accessToken) {
      try {
        const results = await Promise.all(
          PORTFOLIO_CHAINS.map(async (chain) => {
            const data = await fetchUserBalanceForChain(accessToken, chain);
            if (!data?.address) return { chain, balances: null };
            const { address: _a, ...balances } = data;
            return { chain, balances };
          })
        );
        const parts = results
          .filter((r) => r.balances && Object.keys(r.balances).length > 0)
          .map((r) => `${r.chain}: ${JSON.stringify(r.balances)}`);
        if (parts.length > 0) {
          balanceBlock = `Portfolio (all chains). User's Privy wallet balances:\n${parts.join('\n')}`;
        }
      } catch (balanceErr) {
        console.warn('[Chat] Portfolio balance fetch failed:', balanceErr);
      }
    }

    const systemPrompt = buildSystemPrompt(memoryBlock, swapHistoryBlock, selectedChain, balanceBlock);

    // Actual OpenAI Call (history roles are 'user' | 'assistant' from chat UI)
    const historyMessages = (Array.isArray(history) ? history : [])
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: typeof m.content === 'string' ? m.content : '' }))
      .filter((m) => m.content !== undefined);
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: message ?? '' },
      ],
    });

    const aiResponse = response.choices[0].message.content || "";

    const executionNote: string | null = null;

    // Persist summary into user-scoped 0G memory.
    if (accessToken) {
      try {
        const write = await saveUserMemory({
          key: 'chat_summary_latest',
          accessToken,
          value: JSON.stringify(buildUpdatedChatSummary(priorMemory, message ?? '', aiResponse)),
        });
        zgHash = write.rootHash ?? null;
        if (write.backend === 'local_file' && write.error) {
          zgError = write.error;
        }
        console.log('[0G] Post-write memory', {
          backend: write.backend,
          rootHash: write.rootHash ?? null,
          namespace: write.namespace,
          error: write.error ?? null,
        });
      } catch (saveErr) {
        zgError = saveErr instanceof Error ? saveErr.message : 'Failed to save memory to 0G';
        console.warn('0G post-write failed:', saveErr);
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
